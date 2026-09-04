//! Native actual-file preflight for generated rehearsal stem WAVs.
//!
//! A path-free `PlayableStemArtifactSetReference` is metadata, not playback
//! authority. This module derives the only permitted paths from the native-owned
//! project temp root and verifies the complete four-file set before a later
//! playback-authority step may retain any of it. No path or file handle from this
//! module is serializable to the renderer.

use bandscope_desktop_core::playable_stem_contract::{
    PlaybackStemKind, PlayableStemArtifactReference, PlayableStemArtifactSetReference,
};
use std::{
    collections::BTreeSet,
    ffi::OsString,
    fs::{self, File, Metadata},
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

const CANONICAL_WAVE_HEADER_BYTES: usize = 44;
const PCM16_BYTES_PER_SAMPLE: u64 = 2;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;

/// Stable, payload-free reasons native stem admission can fail.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlayableStemAdmissionError {
    /// The project-owned temp root is absent, not a directory, or redirecting.
    InvalidProjectTempRoot,
    /// The version/set directory does not have the exact canonical shape.
    InvalidArtifactSetLayout,
    /// One expected artifact is absent, redirected, non-regular, or unreadable.
    InvalidArtifactFile,
    /// File length does not match the path-free artifact contract.
    FileSizeMismatch,
    /// The file is not the canonical mono PCM16 RIFF/WAVE described by metadata.
    WaveHeaderMismatch,
    /// Complete-file SHA-256 differs from the path-free contract.
    ContentHashMismatch,
}

impl std::fmt::Display for PlayableStemAdmissionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::InvalidProjectTempRoot => "playable stem project temp root is invalid",
            Self::InvalidArtifactSetLayout => "playable stem artifact-set layout is invalid",
            Self::InvalidArtifactFile => "playable stem artifact file is invalid",
            Self::FileSizeMismatch => "playable stem artifact size does not match metadata",
            Self::WaveHeaderMismatch => "playable stem WAV header does not match metadata",
            Self::ContentHashMismatch => "playable stem content hash does not match metadata",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for PlayableStemAdmissionError {}

/// One actual file that passed native path/layout/byte/header/hash preflight.
///
/// This value intentionally does not implement `Serialize`; its path remains a
/// native-process detail and cannot become renderer authority by accident.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreflightPlayableStemFile {
    stem_kind: PlaybackStemKind,
    native_path: PathBuf,
    file_size_bytes: u64,
    content_hash_sha256: String,
}

impl PreflightPlayableStemFile {
    /// Return which canonical stem this actual file represents.
    pub const fn stem_kind(&self) -> PlaybackStemKind {
        self.stem_kind
    }

    /// Return the native-only canonical file path for later authority admission.
    pub fn native_path(&self) -> &Path {
        &self.native_path
    }

    /// Return the byte length verified on the opened file.
    pub const fn file_size_bytes(&self) -> u64 {
        self.file_size_bytes
    }

    /// Return the SHA-256 digest recomputed over the complete opened file.
    pub fn content_hash_sha256(&self) -> &str {
        &self.content_hash_sha256
    }
}

/// Complete actual-file preflight result. Partial stem sets are never returned.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreflightPlayableStemSet {
    artifact_set_id: String,
    files: Vec<PreflightPlayableStemFile>,
}

impl PreflightPlayableStemSet {
    /// Return the path-free artifact-set identity that was verified on disk.
    pub fn artifact_set_id(&self) -> &str {
        &self.artifact_set_id
    }

    /// Return all four verified files in canonical vocals/bass/drums/other order.
    pub fn files(&self) -> &[PreflightPlayableStemFile] {
        &self.files
    }
}

/// Verify the complete generated stem set under a native-owned project temp root.
///
/// This function grants no playback authority. Callers must still bind the
/// returned files to the current project using #971's revocable native file
/// identity/serving boundary before exposing any opaque renderer handle.
pub fn preflight_playable_stem_set(
    project_temp_root: &Path,
    artifact_set: &PlayableStemArtifactSetReference,
) -> Result<PreflightPlayableStemSet, PlayableStemAdmissionError> {
    validate_directory(project_temp_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidProjectTempRoot)?;
    let canonical_temp_root = project_temp_root
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidProjectTempRoot)?;
    if canonical_temp_root != project_temp_root {
        return Err(PlayableStemAdmissionError::InvalidProjectTempRoot);
    }

    let version_root = canonical_temp_root.join("playable-stems-v1");
    validate_directory(&version_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    let canonical_version_root = version_root
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    if canonical_version_root != version_root || !canonical_version_root.starts_with(&canonical_temp_root)
    {
        return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
    }

    let artifact_set_root = canonical_version_root.join(artifact_set.artifact_set_id());
    validate_directory(&artifact_set_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    let canonical_artifact_set_root = artifact_set_root
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    if canonical_artifact_set_root != artifact_set_root
        || canonical_artifact_set_root.parent() != Some(canonical_version_root.as_path())
    {
        return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
    }

    validate_exact_artifact_members(&canonical_artifact_set_root)?;

    let expected_stems = PlaybackStemKind::canonical_order();
    let mut verified_files = Vec::with_capacity(expected_stems.len());
    for (artifact, expected_stem) in artifact_set
        .stem_artifacts()
        .iter()
        .zip(expected_stems)
    {
        if artifact.stem_kind() != expected_stem {
            return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
        }
        verified_files.push(preflight_artifact(
            &canonical_artifact_set_root,
            artifact,
            artifact_set,
        )?);
    }

    if verified_files.len() != expected_stems.len() {
        return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
    }

    Ok(PreflightPlayableStemSet {
        artifact_set_id: artifact_set.artifact_set_id().to_string(),
        files: verified_files,
    })
}

fn validate_exact_artifact_members(
    artifact_set_root: &Path,
) -> Result<(), PlayableStemAdmissionError> {
    let actual_members = fs::read_dir(artifact_set_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?
        .map(|entry| {
            entry
                .map(|entry| entry.file_name())
                .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)
        })
        .collect::<Result<BTreeSet<OsString>, _>>()?;
    let expected_members = PlaybackStemKind::canonical_order()
        .into_iter()
        .map(|stem_kind| OsString::from(stem_kind.file_name()))
        .collect::<BTreeSet<_>>();

    if actual_members != expected_members {
        return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
    }
    Ok(())
}

fn preflight_artifact(
    artifact_set_root: &Path,
    artifact: &PlayableStemArtifactReference,
    artifact_set: &PlayableStemArtifactSetReference,
) -> Result<PreflightPlayableStemFile, PlayableStemAdmissionError> {
    let native_path = artifact_set.derive_artifact_path(
        artifact_set_root
            .parent()
            .and_then(Path::parent)
            .ok_or(PlayableStemAdmissionError::InvalidArtifactSetLayout)?,
        artifact.stem_kind(),
    );
    let expected_path = artifact_set_root.join(artifact.stem_kind().file_name());
    if native_path != expected_path {
        return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
    }

    let link_metadata = fs::symlink_metadata(&native_path)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    if link_metadata.file_type().is_symlink()
        || is_reparse_point(&link_metadata)
        || !link_metadata.is_file()
    {
        return Err(PlayableStemAdmissionError::InvalidArtifactFile);
    }
    if link_metadata.len() != artifact.file_size_bytes() {
        return Err(PlayableStemAdmissionError::FileSizeMismatch);
    }

    let canonical_path = native_path
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    if canonical_path != native_path || canonical_path.parent() != Some(artifact_set_root) {
        return Err(PlayableStemAdmissionError::InvalidArtifactFile);
    }

    let mut file = File::open(&canonical_path)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    let opened_metadata = file
        .metadata()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    if !opened_metadata.is_file() || opened_metadata.len() != artifact.file_size_bytes() {
        return Err(PlayableStemAdmissionError::FileSizeMismatch);
    }

    validate_wave_header(&mut file, artifact, artifact_set)?;
    file.seek(SeekFrom::Start(0))
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    let content_hash_sha256 = sha256_hex_reader(&mut file)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    if content_hash_sha256 != artifact.content_hash_sha256() {
        return Err(PlayableStemAdmissionError::ContentHashMismatch);
    }

    let final_metadata = file
        .metadata()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactFile)?;
    if !final_metadata.is_file() || final_metadata.len() != opened_metadata.len() {
        return Err(PlayableStemAdmissionError::InvalidArtifactFile);
    }

    Ok(PreflightPlayableStemFile {
        stem_kind: artifact.stem_kind(),
        native_path: canonical_path,
        file_size_bytes: final_metadata.len(),
        content_hash_sha256,
    })
}

fn validate_wave_header(
    file: &mut File,
    artifact: &PlayableStemArtifactReference,
    artifact_set: &PlayableStemArtifactSetReference,
) -> Result<(), PlayableStemAdmissionError> {
    let mut header = [0u8; CANONICAL_WAVE_HEADER_BYTES];
    file.seek(SeekFrom::Start(0))
        .and_then(|_| file.read_exact(&mut header))
        .map_err(|_| PlayableStemAdmissionError::WaveHeaderMismatch)?;

    let file_size = artifact.file_size_bytes();
    let expected_data_size = artifact_set
        .sample_count()
        .checked_mul(PCM16_BYTES_PER_SAMPLE)
        .ok_or(PlayableStemAdmissionError::WaveHeaderMismatch)?;
    let expected_riff_size = file_size
        .checked_sub(8)
        .ok_or(PlayableStemAdmissionError::WaveHeaderMismatch)?;
    let expected_byte_rate = artifact_set
        .sample_rate()
        .checked_mul(PCM16_BYTES_PER_SAMPLE as u32)
        .ok_or(PlayableStemAdmissionError::WaveHeaderMismatch)?;

    if &header[0..4] != b"RIFF"
        || read_u32_le(&header[4..8]) != Some(expected_riff_size as u32)
        || &header[8..12] != b"WAVE"
        || &header[12..16] != b"fmt "
        || read_u32_le(&header[16..20]) != Some(16)
        || read_u16_le(&header[20..22]) != Some(1)
        || read_u16_le(&header[22..24]) != Some(1)
        || read_u32_le(&header[24..28]) != Some(artifact_set.sample_rate())
        || read_u32_le(&header[28..32]) != Some(expected_byte_rate)
        || read_u16_le(&header[32..34]) != Some(2)
        || read_u16_le(&header[34..36]) != Some(16)
        || &header[36..40] != b"data"
        || read_u32_le(&header[40..44]) != Some(expected_data_size as u32)
        || artifact.sample_rate() != artifact_set.sample_rate()
        || artifact.channel_count() != 1
        || artifact.sample_count() != artifact_set.sample_count()
    {
        return Err(PlayableStemAdmissionError::WaveHeaderMismatch);
    }

    Ok(())
}

fn read_u16_le(bytes: &[u8]) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.try_into().ok()?))
}

fn read_u32_le(bytes: &[u8]) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.try_into().ok()?))
}

fn validate_directory(path: &Path) -> Result<(), ()> {
    let metadata = fs::symlink_metadata(path).map_err(|_| ())?;
    if metadata.file_type().is_symlink() || is_reparse_point(&metadata) || !metadata.is_dir() {
        return Err(());
    }
    Ok(())
}

#[cfg(windows)]
fn is_reparse_point(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_metadata: &Metadata) -> bool {
    false
}

const SHA256_BLOCK_BYTES: usize = 64;
const SHA256_DIGEST_BYTES: usize = 32;
const SHA256_INITIAL_STATE: [u32; 8] = [
    0x6a09_e667,
    0xbb67_ae85,
    0x3c6e_f372,
    0xa54f_f53a,
    0x510e_527f,
    0x9b05_688c,
    0x1f83_d9ab,
    0x5be0_cd19,
];
const SHA256_ROUND_CONSTANTS: [u32; 64] = [
    0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1,
    0x923f_82a4, 0xab1c_5ed5, 0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3,
    0x72be_5d74, 0x80de_b1fe, 0x9bdc_06a7, 0xc19b_f174, 0xe49b_69c1, 0xefbe_4786,
    0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f, 0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da,
    0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7, 0xc6e0_0bf3, 0xd5a7_9147,
    0x06ca_6351, 0x1429_2967, 0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc, 0x5338_0d13,
    0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85, 0xa2bf_e8a1, 0xa81a_664b,
    0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070,
    0x19a4_c116, 0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a,
    0x5b9c_ca4f, 0x682e_6ff3, 0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208,
    0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7, 0xc671_78f2,
];

#[derive(Clone)]
struct Sha256State {
    state: [u32; 8],
    buffer: [u8; SHA256_BLOCK_BYTES],
    buffer_len: usize,
    message_len_bytes: u64,
}

impl Default for Sha256State {
    fn default() -> Self {
        Self {
            state: SHA256_INITIAL_STATE,
            buffer: [0; SHA256_BLOCK_BYTES],
            buffer_len: 0,
            message_len_bytes: 0,
        }
    }
}

impl Sha256State {
    fn update(&mut self, mut bytes: &[u8]) -> io::Result<()> {
        self.message_len_bytes = self
            .message_len_bytes
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "SHA-256 input is too large"))?;

        if self.buffer_len != 0 {
            let copied = (SHA256_BLOCK_BYTES - self.buffer_len).min(bytes.len());
            self.buffer[self.buffer_len..self.buffer_len + copied]
                .copy_from_slice(&bytes[..copied]);
            self.buffer_len += copied;
            bytes = &bytes[copied..];
            if self.buffer_len == SHA256_BLOCK_BYTES {
                let block = self.buffer;
                self.compress(&block);
                self.buffer_len = 0;
            }
        }

        while bytes.len() >= SHA256_BLOCK_BYTES {
            let block: &[u8; SHA256_BLOCK_BYTES] = bytes[..SHA256_BLOCK_BYTES]
                .try_into()
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid SHA-256 block"))?;
            self.compress(block);
            bytes = &bytes[SHA256_BLOCK_BYTES..];
        }

        if !bytes.is_empty() {
            self.buffer[..bytes.len()].copy_from_slice(bytes);
            self.buffer_len = bytes.len();
        }
        Ok(())
    }

    fn finalize(mut self) -> io::Result<[u8; SHA256_DIGEST_BYTES]> {
        let message_len_bits = self
            .message_len_bytes
            .checked_mul(8)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "SHA-256 input is too large"))?;

        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;
        if self.buffer_len > 56 {
            self.buffer[self.buffer_len..].fill(0);
            let block = self.buffer;
            self.compress(&block);
            self.buffer = [0; SHA256_BLOCK_BYTES];
            self.buffer_len = 0;
        }
        self.buffer[self.buffer_len..56].fill(0);
        self.buffer[56..].copy_from_slice(&message_len_bits.to_be_bytes());
        let final_block = self.buffer;
        self.compress(&final_block);

        let mut digest = [0u8; SHA256_DIGEST_BYTES];
        for (index, word) in self.state.into_iter().enumerate() {
            digest[index * 4..index * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        Ok(digest)
    }

    fn compress(&mut self, block: &[u8; SHA256_BLOCK_BYTES]) {
        let mut schedule = [0u32; 64];
        for (index, chunk) in block.chunks_exact(4).enumerate() {
            schedule[index] = u32::from_be_bytes(
                chunk.try_into().expect("SHA-256 message word is four bytes"),
            );
        }
        for index in 16..64 {
            let sigma0 = schedule[index - 15].rotate_right(7)
                ^ schedule[index - 15].rotate_right(18)
                ^ (schedule[index - 15] >> 3);
            let sigma1 = schedule[index - 2].rotate_right(17)
                ^ schedule[index - 2].rotate_right(19)
                ^ (schedule[index - 2] >> 10);
            schedule[index] = schedule[index - 16]
                .wrapping_add(sigma0)
                .wrapping_add(schedule[index - 7])
                .wrapping_add(sigma1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;
        for index in 0..64 {
            let big_sigma1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(big_sigma1)
                .wrapping_add(choose)
                .wrapping_add(SHA256_ROUND_CONSTANTS[index])
                .wrapping_add(schedule[index]);
            let big_sigma0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = big_sigma0.wrapping_add(majority);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }
}

fn sha256_hex_reader(mut reader: impl Read) -> io::Result<String> {
    let mut state = Sha256State::default();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(read_bytes) => state.update(&chunk[..read_bytes])?,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }

    let digest = state.finalize()?;
    let mut hex = String::with_capacity(SHA256_DIGEST_BYTES * 2);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in digest {
        hex.push(HEX[(byte >> 4) as usize] as char);
        hex.push(HEX[(byte & 0x0f) as usize] as char);
    }
    Ok(hex)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{io::Cursor, time::{SystemTime, UNIX_EPOCH}};

    const ARTIFACT_SET_ID: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn unique_temp_root(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be after the Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "bandscope-stem-admission-{}-{label}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("test temp root should be created");
        root.canonicalize().expect("test temp root should canonicalize")
    }

    fn pcm16_wave(sample_rate: u32, samples: &[i16]) -> Vec<u8> {
        let data_size = u32::try_from(samples.len() * 2).expect("test PCM data should fit RIFF");
        let mut bytes = Vec::with_capacity(CANONICAL_WAVE_HEADER_BYTES + data_size as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }

    fn artifact_set_for_bytes(sample_rate: u32, stem_bytes: &[Vec<u8>]) -> PlayableStemArtifactSetReference {
        let sample_count = ((stem_bytes[0].len() - CANONICAL_WAVE_HEADER_BYTES) / 2) as u64;
        let duration_seconds = sample_count as f64 / sample_rate as f64;
        let artifacts = PlaybackStemKind::canonical_order()
            .into_iter()
            .zip(stem_bytes)
            .map(|(stem_kind, bytes)| {
                json!({
                    "artifactId": stem_kind.artifact_id(),
                    "stemKind": match stem_kind {
                        PlaybackStemKind::Vocals => "vocals",
                        PlaybackStemKind::Bass => "bass",
                        PlaybackStemKind::Drums => "drums",
                        PlaybackStemKind::Other => "other",
                    },
                    "fileSizeBytes": bytes.len(),
                    "contentHashSha256": sha256_hex_reader(Cursor::new(bytes)).expect("fixture should hash"),
                    "mediaType": "audio/wav",
                    "sampleRate": sample_rate,
                    "channelCount": 1,
                    "sampleCount": sample_count,
                    "durationSeconds": duration_seconds
                })
            })
            .collect::<Vec<_>>();

        serde_json::from_value(json!({
            "artifactSetId": ARTIFACT_SET_ID,
            "formatVersion": 1,
            "sampleRate": sample_rate,
            "channelCount": 1,
            "sampleCount": sample_count,
            "durationSeconds": duration_seconds,
            "appliedGain": 1.0,
            "stemArtifacts": artifacts
        }))
        .expect("artifact-set fixture should satisfy the core contract")
    }

    fn write_set(root: &Path, stem_bytes: &[Vec<u8>]) -> PathBuf {
        let set_root = root.join("playable-stems-v1").join(ARTIFACT_SET_ID);
        fs::create_dir_all(&set_root).expect("artifact-set fixture directory should be created");
        for (stem_kind, bytes) in PlaybackStemKind::canonical_order().into_iter().zip(stem_bytes) {
            fs::write(set_root.join(stem_kind.file_name()), bytes)
                .expect("artifact fixture should be written");
        }
        set_root
    }

    fn canonical_fixture() -> (PathBuf, PlayableStemArtifactSetReference, Vec<Vec<u8>>) {
        let root = unique_temp_root("valid");
        let samples = [0i16, 1, -1, i16::MAX, i16::MIN, 120, -120, 7];
        let stem_bytes = (0..4)
            .map(|_| pcm16_wave(8_000, &samples))
            .collect::<Vec<_>>();
        let artifact_set = artifact_set_for_bytes(8_000, &stem_bytes);
        write_set(&root, &stem_bytes);
        (root, artifact_set, stem_bytes)
    }

    #[test]
    fn accepts_only_the_complete_canonical_pcm16_set() {
        let (root, artifact_set, _) = canonical_fixture();
        let admitted = preflight_playable_stem_set(&root, &artifact_set)
            .expect("complete canonical set should pass native preflight");

        assert_eq!(admitted.artifact_set_id(), ARTIFACT_SET_ID);
        assert_eq!(
            admitted.files().iter().map(PreflightPlayableStemFile::stem_kind).collect::<Vec<_>>(),
            PlaybackStemKind::canonical_order()
        );
        assert!(admitted.files().iter().all(|file| file.native_path().starts_with(&root)));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_same_size_content_mutation_by_complete_file_hash() {
        let (root, artifact_set, _) = canonical_fixture();
        let vocals = artifact_set.derive_artifact_path(&root, PlaybackStemKind::Vocals);
        let mut mutated = fs::read(&vocals).expect("fixture should read");
        let last = mutated.len() - 1;
        mutated[last] ^= 0x01;
        fs::write(&vocals, mutated).expect("same-size mutation should write");

        assert_eq!(
            preflight_playable_stem_set(&root, &artifact_set),
            Err(PlayableStemAdmissionError::ContentHashMismatch)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_noncanonical_wave_header_even_when_hash_metadata_matches() {
        let root = unique_temp_root("header");
        let samples = [0i16; 8];
        let mut stem_bytes = (0..4)
            .map(|_| pcm16_wave(8_000, &samples))
            .collect::<Vec<_>>();
        stem_bytes[0][34] = 24;
        let artifact_set = artifact_set_for_bytes(8_000, &stem_bytes);
        write_set(&root, &stem_bytes);

        assert_eq!(
            preflight_playable_stem_set(&root, &artifact_set),
            Err(PlayableStemAdmissionError::WaveHeaderMismatch)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_unexpected_artifact_set_members() {
        let (root, artifact_set, _) = canonical_fixture();
        let unexpected = root
            .join("playable-stems-v1")
            .join(ARTIFACT_SET_ID)
            .join("notes.txt");
        fs::write(unexpected, b"not media").expect("unexpected member should write");

        assert_eq!(
            preflight_playable_stem_set(&root, &artifact_set),
            Err(PlayableStemAdmissionError::InvalidArtifactSetLayout)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_stem_even_when_target_bytes_match() {
        use std::os::unix::fs::symlink;

        let (root, artifact_set, stem_bytes) = canonical_fixture();
        let vocals = artifact_set.derive_artifact_path(&root, PlaybackStemKind::Vocals);
        let replacement = root.join("replacement.wav");
        fs::write(&replacement, &stem_bytes[0]).expect("replacement fixture should write");
        fs::remove_file(&vocals).expect("original vocals fixture should be removed");
        symlink(&replacement, &vocals).expect("symlink fixture should be created");

        assert_eq!(
            preflight_playable_stem_set(&root, &artifact_set),
            Err(PlayableStemAdmissionError::InvalidArtifactFile)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sha256_matches_nist_style_known_answer_vectors() {
        for (message, expected) in [
            (
                &b""[..],
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            ),
            (
                &b"abc"[..],
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ),
            (
                &b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"[..],
                "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
            ),
        ] {
            assert_eq!(sha256_hex_reader(Cursor::new(message)).as_deref(), Ok(expected));
        }
    }
}
