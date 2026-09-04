//! Native actual-file preflight for generated rehearsal stem WAVs.
//!
//! A path-free `PlayableStemArtifactSetReference` is metadata, not playback
//! authority. This module derives the only permitted paths from the native-owned
//! project temp root and validates the complete four-file set before the existing
//! Active Player authority may retain any of it. No path from this module is
//! serializable to the renderer.

mod sha256;

use bandscope_desktop_core::playable_stem_contract::{
    PlaybackStemKind, PlayableStemArtifactReference, PlayableStemArtifactSetReference,
};
use sha256::sha256_hex_reader;
use std::{
    collections::BTreeSet,
    ffi::OsString,
    fs::{self, File, Metadata},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

const CANONICAL_WAVE_HEADER_BYTES: usize = 44;
const PCM16_BYTES_PER_SAMPLE: u64 = 2;
#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;

/// Stable, payload-free reasons native stem preflight can fail.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlayableStemAdmissionError {
    /// The project-owned temp root is absent, non-directory, or redirecting.
    InvalidProjectTempRoot,
    /// The version/set directory does not have the exact canonical shape.
    InvalidArtifactSetLayout,
    /// One expected artifact is absent, redirected, non-regular, or unreadable.
    InvalidArtifactFile,
    /// File length does not match the path-free artifact contract.
    FileSizeMismatch,
    /// The file is not canonical mono PCM16 RIFF/WAVE matching the metadata.
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
/// The type intentionally does not implement `Serialize`; the canonical path is
/// trusted-process state, not a renderer contract or playback handle.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreflightPlayableStemFile {
    stem_kind: PlaybackStemKind,
    native_path: PathBuf,
    file_size_bytes: u64,
    content_hash_sha256: String,
}

impl PreflightPlayableStemFile {
    /// Return which canonical stem this file represents.
    pub const fn stem_kind(&self) -> PlaybackStemKind {
        self.stem_kind
    }

    /// Return the canonical native-only path for later authority binding.
    pub fn native_path(&self) -> &Path {
        &self.native_path
    }

    /// Return the byte length checked on the opened file.
    pub const fn file_size_bytes(&self) -> u64 {
        self.file_size_bytes
    }

    /// Return the SHA-256 recomputed across the complete opened file.
    pub fn content_hash_sha256(&self) -> &str {
        &self.content_hash_sha256
    }
}

/// Complete preflight result. Partial stem sets are never returned.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreflightPlayableStemSet {
    artifact_set_id: String,
    files: Vec<PreflightPlayableStemFile>,
}

impl PreflightPlayableStemSet {
    /// Return the path-free artifact-set identity verified on disk.
    pub fn artifact_set_id(&self) -> &str {
        &self.artifact_set_id
    }

    /// Return all four files in canonical vocals/bass/drums/other order.
    pub fn files(&self) -> &[PreflightPlayableStemFile] {
        &self.files
    }
}

/// Verify actual generated stem bytes without granting playback authority.
///
/// The caller must still bind the returned files to the current project using
/// #971's revocable native file-identity/serving boundary before exposing an
/// opaque source handle.
pub fn preflight_playable_stem_set(
    project_temp_root: &Path,
    artifact_set: &PlayableStemArtifactSetReference,
) -> Result<PreflightPlayableStemSet, PlayableStemAdmissionError> {
    if !project_temp_root.is_absolute() {
        return Err(PlayableStemAdmissionError::InvalidProjectTempRoot);
    }
    validate_directory(project_temp_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidProjectTempRoot)?;
    let canonical_temp_root = project_temp_root
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidProjectTempRoot)?;

    let version_root = canonical_temp_root.join("playable-stems-v1");
    validate_directory(&version_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    let canonical_version_root = version_root
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    if canonical_version_root.parent() != Some(canonical_temp_root.as_path()) {
        return Err(PlayableStemAdmissionError::InvalidArtifactSetLayout);
    }

    let artifact_set_root = canonical_version_root.join(artifact_set.artifact_set_id());
    validate_directory(&artifact_set_root)
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    let canonical_artifact_set_root = artifact_set_root
        .canonicalize()
        .map_err(|_| PlayableStemAdmissionError::InvalidArtifactSetLayout)?;
    if canonical_artifact_set_root.parent() != Some(canonical_version_root.as_path()) {
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
            &canonical_temp_root,
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
    canonical_temp_root: &Path,
    artifact_set_root: &Path,
    artifact: &PlayableStemArtifactReference,
    artifact_set: &PlayableStemArtifactSetReference,
) -> Result<PreflightPlayableStemFile, PlayableStemAdmissionError> {
    let native_path = artifact_set.derive_artifact_path(canonical_temp_root, artifact.stem_kind());
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
    if canonical_path.parent() != Some(artifact_set_root)
        || canonical_path.file_name() != Some(OsString::from(artifact.stem_kind().file_name()).as_os_str())
    {
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

    let expected_data_size = artifact_set
        .sample_count()
        .checked_mul(PCM16_BYTES_PER_SAMPLE)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(PlayableStemAdmissionError::WaveHeaderMismatch)?;
    let expected_riff_size = artifact
        .file_size_bytes()
        .checked_sub(8)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(PlayableStemAdmissionError::WaveHeaderMismatch)?;
    let expected_byte_rate = artifact_set
        .sample_rate()
        .checked_mul(PCM16_BYTES_PER_SAMPLE as u32)
        .ok_or(PlayableStemAdmissionError::WaveHeaderMismatch)?;

    if &header[0..4] != b"RIFF"
        || read_u32_le(&header[4..8]) != Some(expected_riff_size)
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
        || read_u32_le(&header[40..44]) != Some(expected_data_size)
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{
        io::Cursor,
        time::{SystemTime, UNIX_EPOCH},
    };

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

    fn artifact_set_for_bytes(
        sample_rate: u32,
        stem_bytes: &[Vec<u8>],
    ) -> PlayableStemArtifactSetReference {
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
        let preflight = preflight_playable_stem_set(&root, &artifact_set)
            .expect("complete canonical set should pass native preflight");

        assert_eq!(preflight.artifact_set_id(), ARTIFACT_SET_ID);
        assert_eq!(
            preflight
                .files()
                .iter()
                .map(PreflightPlayableStemFile::stem_kind)
                .collect::<Vec<_>>(),
            PlaybackStemKind::canonical_order()
        );
        assert!(preflight
            .files()
            .iter()
            .all(|file| file.native_path().starts_with(&root)));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_relative_project_temp_root() {
        let (_, artifact_set, _) = canonical_fixture();
        assert_eq!(
            preflight_playable_stem_set(Path::new("relative-project-temp"), &artifact_set),
            Err(PlayableStemAdmissionError::InvalidProjectTempRoot)
        );
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
}
