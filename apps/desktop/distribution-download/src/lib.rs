//! Resource-bounded streaming admission for BandScope updater artifacts.
//!
//! The current Tauri updater returns verified artifacts as an in-memory byte
//! vector. BandScope's commercial Distribution boundary needs an independent
//! streaming primitive and an exclusive app-owned staging sink before it can
//! claim bounded hostile-response handling. This crate owns byte-count and
//! temporary-file admission only. It does not perform HTTP, metadata
//! authentication, signature or digest verification, installation, rollback,
//! or project persistence.

#![forbid(unsafe_code)]

use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};

/// Hard ceiling for one updater artifact accepted by the Distribution boundary.
pub const MAX_UPDATER_ARTIFACT_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Largest single response chunk the adapter may hand to this boundary.
pub const MAX_DOWNLOAD_CHUNK_BYTES: usize = 1024 * 1024;
/// Largest product-owned staging filename accepted by this boundary.
pub const MAX_ARTIFACT_NAME_BYTES: usize = 180;

const STAGING_LEASE_FILE_NAME: &str = ".bandscope-staging.lock";

/// Fail-closed reasons for bounded updater-artifact admission.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DownloadAdmissionError {
    /// The expected artifact length is zero or exceeds the product ceiling.
    InvalidExpectedSize,
    /// A response `Content-Length`, when present, disagrees with authenticated metadata.
    ContentLengthMismatch,
    /// One caller-provided response chunk exceeds the bounded adapter contract.
    ChunkTooLarge,
    /// Accepting a chunk would exceed the authenticated artifact length.
    ExceedsExpectedSize,
    /// The destination sink failed while accepting artifact bytes.
    SinkWriteFailed(ErrorKind),
    /// A previous admission or sink failure poisoned this download attempt.
    Poisoned,
    /// The response ended before the authenticated artifact length was reached.
    Incomplete,
}

/// Fail-closed reasons for updater staging-file lifecycle operations.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StagingArtifactError {
    /// The artifact name is not a bounded portable basename.
    InvalidArtifactName,
    /// The supplied staging directory cannot be inspected.
    StagingDirectoryUnavailable(ErrorKind),
    /// The staging root is not a direct, non-symlink directory.
    InvalidStagingDirectory,
    /// A live staging attempt already owns the scratch namespace lease.
    ConcurrentAttempt,
    /// A non-regular destination exists or another writer won the exclusive create race.
    DestinationExists,
    /// Exclusive staging-file creation, lease acquisition, or stale-regular cleanup failed.
    CreateFailed(ErrorKind),
    /// Flushing userspace buffers failed before sealing.
    FlushFailed(ErrorKind),
    /// Synchronizing staged bytes to the operating system failed.
    SyncFailed(ErrorKind),
    /// Descriptor-bound metadata could not be read after synchronization.
    MetadataFailed(ErrorKind),
    /// The staged descriptor is no longer a regular file.
    NonRegularArtifact,
    /// Descriptor size disagrees with the exact download receipt.
    SizeMismatch,
}

/// Byte-count evidence emitted only after an exactly sized stream completes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DownloadReceipt {
    bytes_written: u64,
}

impl DownloadReceipt {
    /// Return the exact number of bytes admitted to the sink.
    pub const fn bytes_written(self) -> u64 {
        self.bytes_written
    }
}

/// Stateful byte-admission guard for one updater artifact response.
///
/// The guard rejects overrun before writing the offending chunk. Any sink
/// failure or hostile overrun poisons the attempt so later chunks cannot turn a
/// partially failed response into a successful receipt.
#[derive(Debug)]
pub struct ArtifactDownloadAdmission {
    expected_size_bytes: u64,
    received_size_bytes: u64,
    poisoned: bool,
}

impl ArtifactDownloadAdmission {
    /// Start one bounded download from authenticated expected size evidence.
    ///
    /// `response_content_length` is advisory transport metadata. When the HTTP
    /// stack supplies it, it must match the authenticated expected size before
    /// body streaming starts. `None` remains acceptable for chunked transfer;
    /// cumulative admission still enforces the exact authenticated byte count.
    pub fn new(
        expected_size_bytes: u64,
        response_content_length: Option<u64>,
    ) -> Result<Self, DownloadAdmissionError> {
        if expected_size_bytes == 0 || expected_size_bytes > MAX_UPDATER_ARTIFACT_BYTES {
            return Err(DownloadAdmissionError::InvalidExpectedSize);
        }
        if response_content_length.is_some_and(|length| length != expected_size_bytes) {
            return Err(DownloadAdmissionError::ContentLengthMismatch);
        }
        Ok(Self {
            expected_size_bytes,
            received_size_bytes: 0,
            poisoned: false,
        })
    }

    /// Admit one already-bounded response chunk into the supplied sink.
    ///
    /// This method never allocates a copy of `chunk`. The network adapter must
    /// itself stream bounded chunks rather than buffering the full response
    /// before this boundary is called.
    pub fn write_chunk<W: Write>(
        &mut self,
        sink: &mut W,
        chunk: &[u8],
    ) -> Result<(), DownloadAdmissionError> {
        if self.poisoned {
            return Err(DownloadAdmissionError::Poisoned);
        }
        if chunk.len() > MAX_DOWNLOAD_CHUNK_BYTES {
            self.poisoned = true;
            return Err(DownloadAdmissionError::ChunkTooLarge);
        }
        let chunk_size = u64::try_from(chunk.len()).map_err(|_| {
            self.poisoned = true;
            DownloadAdmissionError::ChunkTooLarge
        })?;
        let next_size = self
            .received_size_bytes
            .checked_add(chunk_size)
            .ok_or_else(|| {
                self.poisoned = true;
                DownloadAdmissionError::ExceedsExpectedSize
            })?;
        if next_size > self.expected_size_bytes {
            self.poisoned = true;
            return Err(DownloadAdmissionError::ExceedsExpectedSize);
        }
        if let Err(error) = sink.write_all(chunk) {
            self.poisoned = true;
            return Err(DownloadAdmissionError::SinkWriteFailed(error.kind()));
        }
        self.received_size_bytes = next_size;
        Ok(())
    }

    /// Return bytes handed successfully to the current sink.
    pub const fn received_size_bytes(&self) -> u64 {
        self.received_size_bytes
    }

    /// Finish the response only when exactly the authenticated size was written.
    pub fn finish(self) -> Result<DownloadReceipt, DownloadAdmissionError> {
        if self.poisoned {
            return Err(DownloadAdmissionError::Poisoned);
        }
        if self.received_size_bytes != self.expected_size_bytes {
            return Err(DownloadAdmissionError::Incomplete);
        }
        Ok(DownloadReceipt {
            bytes_written: self.received_size_bytes,
        })
    }
}

/// Exclusive temporary artifact owned by the Distribution staging directory.
///
/// Creation accepts one portable basename under an already-existing app-owned
/// non-symlink directory. A process-scoped exclusive lease is acquired before
/// any pre-existing regular artifact can be classified as stale. This directory
/// is an unverified scratch namespace: a regular child may be reclaimed only
/// while that lease is held, so a second cooperating process cannot unlink a
/// live attempt and mistake it for crash residue. Symlinks and other non-regular
/// children are never reclaimed. A later verified artifact owner must move
/// trusted bytes out of this staging namespace before retaining them across
/// launches. Unix removes a descriptor-owned pathname on drop after identity
/// confirmation. Windows deliberately defers pathname reclamation to the next
/// leased staging attempt because stable Rust does not expose an equivalent
/// by-handle file identity suitable for proving that a remembered pathname still
/// denotes the owned object. Callers cannot write the descriptor directly;
/// response bytes must pass through `ArtifactDownloadAdmission` via
/// `admit_chunk`.
#[derive(Debug)]
pub struct StagedArtifactFile {
    file: Option<File>,
    staging_lease: Option<File>,
    path: PathBuf,
    retain_on_drop: bool,
}

impl StagedArtifactFile {
    /// Create one new staging artifact, reclaiming only a stale regular child.
    pub fn create(
        staging_directory: &Path,
        artifact_name: &str,
    ) -> Result<Self, StagingArtifactError> {
        if !is_portable_artifact_name(artifact_name) {
            return Err(StagingArtifactError::InvalidArtifactName);
        }
        let directory_metadata = fs::symlink_metadata(staging_directory)
            .map_err(|error| StagingArtifactError::StagingDirectoryUnavailable(error.kind()))?;
        if directory_metadata.file_type().is_symlink() || !directory_metadata.is_dir() {
            return Err(StagingArtifactError::InvalidStagingDirectory);
        }

        let staging_lease = acquire_staging_lease(staging_directory)?;
        let path = staging_directory.join(artifact_name);
        match fs::symlink_metadata(&path) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err(StagingArtifactError::DestinationExists);
                }
                fs::remove_file(&path)
                    .map_err(|error| StagingArtifactError::CreateFailed(error.kind()))?;
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(StagingArtifactError::CreateFailed(error.kind())),
        }

        let file = match OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                return Err(StagingArtifactError::DestinationExists);
            }
            Err(error) => return Err(StagingArtifactError::CreateFailed(error.kind())),
        };

        Ok(Self {
            file: Some(file),
            staging_lease: Some(staging_lease),
            path,
            retain_on_drop: false,
        })
    }

    /// Return the direct child path reserved for this staging attempt.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Admit one response chunk through the byte-count guard into this file.
    pub fn admit_chunk(
        &mut self,
        admission: &mut ArtifactDownloadAdmission,
        chunk: &[u8],
    ) -> Result<(), DownloadAdmissionError> {
        let file = self
            .file
            .as_mut()
            .expect("staged artifact descriptor remains present before seal");
        admission.write_chunk(file, chunk)
    }

    /// Flush, synchronize, and descriptor-check an exactly downloaded artifact.
    ///
    /// A successful seal transfers cleanup responsibility and the staging lease
    /// to a still-open `SealedArtifactFile` so later digest/signature verification
    /// remains bound to the exact staged bytes rather than reopening an
    /// attacker-selected path. Sealing is not trust promotion: the sealed file
    /// remains cleanup-on-drop until a later verified-artifact boundary exists.
    pub fn seal(
        mut self,
        receipt: DownloadReceipt,
    ) -> Result<SealedArtifactFile, StagingArtifactError> {
        let file = self
            .file
            .as_mut()
            .expect("staged artifact descriptor remains present before seal");
        file.flush()
            .map_err(|error| StagingArtifactError::FlushFailed(error.kind()))?;
        file.sync_all()
            .map_err(|error| StagingArtifactError::SyncFailed(error.kind()))?;
        let metadata = file
            .metadata()
            .map_err(|error| StagingArtifactError::MetadataFailed(error.kind()))?;
        if !metadata.file_type().is_file() {
            return Err(StagingArtifactError::NonRegularArtifact);
        }
        if metadata.len() != receipt.bytes_written() {
            return Err(StagingArtifactError::SizeMismatch);
        }

        self.retain_on_drop = true;
        let sealed_file = self
            .file
            .take()
            .expect("staged artifact descriptor remains present after validation");
        let staging_lease = self
            .staging_lease
            .take()
            .expect("staging lease remains held through seal");
        Ok(SealedArtifactFile {
            file: Some(sealed_file),
            staging_lease: Some(staging_lease),
            path: self.path.clone(),
            bytes_written: receipt.bytes_written(),
        })
    }
}

impl Drop for StagedArtifactFile {
    fn drop(&mut self) {
        if self.retain_on_drop {
            return;
        }
        if let Some(file) = self.file.take() {
            cleanup_owned_staging_path(file, &self.path);
        }
        let _ = self.staging_lease.take();
    }
}

/// Synchronized but still unverified staging artifact.
///
/// The descriptor and staging lease stay open for later digest/signature
/// verification. On Unix, dropping this value removes the staging pathname only
/// when it still resolves to the descriptor-owned file; a replacement pathname
/// is left untouched. On Windows, drop closes the descriptor but intentionally
/// leaves the pathname in the app-owned scratch directory because stable Rust
/// does not expose the by-handle identity needed to prove that path ownership.
/// A later staging attempt reclaims a stale regular child only while holding the
/// same process-shared lease. The lease is released after descriptor cleanup. A
/// later trust-promotion type, not this byte-count boundary, must explicitly
/// retain verified bytes.
#[derive(Debug)]
pub struct SealedArtifactFile {
    file: Option<File>,
    staging_lease: Option<File>,
    path: PathBuf,
    bytes_written: u64,
}

/// Read-only view over the exact still-open sealed artifact descriptor.
///
/// Reads are positional and begin at byte zero without reopening the staging
/// path. The stream is capped at the exact byte count admitted before sealing,
/// so post-seal file growth cannot expand verifier memory or alter the byte
/// range considered by downstream digest/signature checks. The wrapper
/// intentionally implements `Read` only: callers cannot recover the underlying
/// write-capable staging descriptor.
#[derive(Debug)]
pub struct SealedArtifactReader<'a> {
    file: &'a File,
    offset: u64,
    remaining_bytes: u64,
}

impl Read for SealedArtifactReader<'_> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if buffer.is_empty() || self.remaining_bytes == 0 {
            return Ok(0);
        }
        let maximum_read = usize::try_from(self.remaining_bytes)
            .unwrap_or(usize::MAX)
            .min(buffer.len());
        let read = descriptor_read_at(self.file, &mut buffer[..maximum_read], self.offset)?;
        if read == 0 {
            return Err(std::io::Error::new(
                ErrorKind::UnexpectedEof,
                "sealed artifact truncated below admitted byte boundary",
            ));
        }
        let read_u64 = u64::try_from(read).map_err(|_| {
            std::io::Error::new(ErrorKind::InvalidData, "sealed read length overflow")
        })?;
        self.offset = self.offset.checked_add(read_u64).ok_or_else(|| {
            std::io::Error::new(ErrorKind::InvalidData, "sealed reader offset overflow")
        })?;
        self.remaining_bytes = self.remaining_bytes.checked_sub(read_u64).ok_or_else(|| {
            std::io::Error::new(ErrorKind::InvalidData, "sealed reader boundary underflow")
        })?;
        Ok(read)
    }
}

impl SealedArtifactFile {
    /// Return the synchronized staging path held for identity verification.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Return the exact admitted byte count bound to this descriptor.
    pub const fn bytes_written(&self) -> u64 {
        self.bytes_written
    }

    /// Open a read-only positional stream over the exact sealed descriptor.
    ///
    /// The stream starts at byte zero, stops at the exact admitted byte count,
    /// and never reopens the staging path. This preserves descriptor binding,
    /// prevents post-seal growth from widening verifier input, and withholds the
    /// underlying write-capable `File` from downstream digest/signature code.
    pub fn reader(&self) -> SealedArtifactReader<'_> {
        SealedArtifactReader {
            file: self
                .file
                .as_ref()
                .expect("sealed artifact descriptor remains present before drop"),
            offset: 0,
            remaining_bytes: self.bytes_written,
        }
    }
}

impl Drop for SealedArtifactFile {
    fn drop(&mut self) {
        if let Some(file) = self.file.take() {
            cleanup_owned_staging_path(file, &self.path);
        }
        let _ = self.staging_lease.take();
    }
}

#[cfg(unix)]
fn cleanup_owned_staging_path(file: File, path: &Path) {
    use std::os::unix::fs::MetadataExt;

    let descriptor_identity = file.metadata().ok().map(|metadata| (metadata.dev(), metadata.ino()));
    if let (Some((descriptor_dev, descriptor_ino)), Ok(path_metadata)) =
        (descriptor_identity, fs::symlink_metadata(path))
    {
        if !path_metadata.file_type().is_symlink()
            && path_metadata.is_file()
            && path_metadata.dev() == descriptor_dev
            && path_metadata.ino() == descriptor_ino
        {
            let _ = fs::remove_file(path);
        }
    }
    drop(file);
}

#[cfg(not(unix))]
fn cleanup_owned_staging_path(file: File, _path: &Path) {
    // Stable Rust does not expose a portable by-handle file identity here.
    // Closing without pathname deletion avoids deleting a replacement object;
    // the next leased staging attempt reclaims stale regular scratch files.
    drop(file);
}

fn acquire_staging_lease(staging_directory: &Path) -> Result<File, StagingArtifactError> {
    let lease_path = staging_directory.join(STAGING_LEASE_FILE_NAME);
    let lease_file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&lease_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(&lease_path)
                .map_err(|error| StagingArtifactError::CreateFailed(error.kind()))?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(StagingArtifactError::DestinationExists);
            }
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(&lease_path)
                .map_err(|error| StagingArtifactError::CreateFailed(error.kind()))?
        }
        Err(error) => return Err(StagingArtifactError::CreateFailed(error.kind())),
    };

    match lease_file.try_lock() {
        Ok(()) => Ok(lease_file),
        Err(TryLockError::WouldBlock) => Err(StagingArtifactError::ConcurrentAttempt),
        Err(TryLockError::Error(error)) => Err(StagingArtifactError::CreateFailed(error.kind())),
    }
}

#[cfg(unix)]
fn descriptor_read_at(file: &File, buffer: &mut [u8], offset: u64) -> std::io::Result<usize> {
    use std::os::unix::fs::FileExt;
    FileExt::read_at(file, buffer, offset)
}

#[cfg(windows)]
fn descriptor_read_at(file: &File, buffer: &mut [u8], offset: u64) -> std::io::Result<usize> {
    use std::os::windows::fs::FileExt;
    FileExt::seek_read(file, buffer, offset)
}

#[cfg(not(any(unix, windows)))]
fn descriptor_read_at(_file: &File, _buffer: &mut [u8], _offset: u64) -> std::io::Result<usize> {
    Err(std::io::Error::new(
        ErrorKind::Unsupported,
        "sealed descriptor reads are supported only on desktop targets",
    ))
}

fn is_portable_artifact_name(name: &str) -> bool {
    if name.is_empty() || name.len() > MAX_ARTIFACT_NAME_BYTES || name.starts_with('.') {
        return false;
    }
    if !name
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return false;
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return false;
    }

    let stem = name.split('.').next().unwrap_or_default().to_ascii_uppercase();
    !is_windows_reserved_stem(&stem)
}

fn is_windows_reserved_stem(stem: &str) -> bool {
    if matches!(stem, "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    let bytes = stem.as_bytes();
    bytes.len() == 4
        && matches!(&bytes[..3], b"COM" | b"LPT")
        && matches!(bytes[3], b'1'..=b'9')
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn exact_chunked_response_emits_receipt() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(6, Some(6)).expect("valid size");

        admission.write_chunk(&mut sink, b"abc").expect("first chunk");
        admission.write_chunk(&mut sink, b"def").expect("second chunk");
        let receipt = admission.finish().expect("exact response should finish");

        assert_eq!(sink, b"abcdef");
        assert_eq!(receipt.bytes_written(), 6);
    }

    #[test]
    fn missing_content_length_still_uses_exact_cumulative_bound() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(4, None).expect("chunked response");

        admission.write_chunk(&mut sink, b"ab").expect("bounded chunk");
        admission.write_chunk(&mut sink, b"cd").expect("bounded chunk");

        assert_eq!(admission.finish().expect("exact chunked response").bytes_written(), 4);
        assert_eq!(sink, b"abcd");
    }

    #[test]
    fn content_length_mismatch_fails_before_body_admission() {
        assert_eq!(
            ArtifactDownloadAdmission::new(8, Some(7)).unwrap_err(),
            DownloadAdmissionError::ContentLengthMismatch
        );
    }

    #[test]
    fn overrun_is_rejected_before_offending_chunk_reaches_sink() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(4, None).expect("valid size");
        admission.write_chunk(&mut sink, b"abc").expect("first chunk");

        assert_eq!(
            admission.write_chunk(&mut sink, b"de"),
            Err(DownloadAdmissionError::ExceedsExpectedSize)
        );
        assert_eq!(sink, b"abc");
        assert_eq!(
            admission.write_chunk(&mut sink, b"d"),
            Err(DownloadAdmissionError::Poisoned)
        );
    }

    #[test]
    fn oversized_single_chunk_poisoning_is_fail_closed() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(
            (MAX_DOWNLOAD_CHUNK_BYTES as u64) + 1,
            None,
        )
        .expect("artifact remains below global ceiling");
        let chunk = vec![0_u8; MAX_DOWNLOAD_CHUNK_BYTES + 1];

        assert_eq!(
            admission.write_chunk(&mut sink, &chunk),
            Err(DownloadAdmissionError::ChunkTooLarge)
        );
        assert!(sink.is_empty());
        assert_eq!(admission.finish(), Err(DownloadAdmissionError::Poisoned));
    }

    #[test]
    fn truncated_response_never_emits_success_receipt() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(5, Some(5)).expect("valid size");
        admission.write_chunk(&mut sink, b"four").expect("partial body");

        assert_eq!(admission.received_size_bytes(), 4);
        assert_eq!(admission.finish(), Err(DownloadAdmissionError::Incomplete));
    }

    struct PartialThenFailWriter {
        accepted: usize,
    }

    impl Write for PartialThenFailWriter {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            if self.accepted == 0 {
                let count = buffer.len().min(1);
                self.accepted += count;
                return Ok(count);
            }
            Err(io::Error::new(ErrorKind::WriteZero, "synthetic sink failure"))
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn partial_sink_failure_poisoning_prevents_false_completion() {
        let mut sink = PartialThenFailWriter { accepted: 0 };
        let mut admission = ArtifactDownloadAdmission::new(3, Some(3)).expect("valid size");

        assert_eq!(
            admission.write_chunk(&mut sink, b"abc"),
            Err(DownloadAdmissionError::SinkWriteFailed(ErrorKind::WriteZero))
        );
        assert_eq!(admission.received_size_bytes(), 0);
        assert_eq!(admission.finish(), Err(DownloadAdmissionError::Poisoned));
    }

    #[test]
    fn zero_and_over_ceiling_expected_sizes_are_rejected() {
        assert_eq!(
            ArtifactDownloadAdmission::new(0, None).unwrap_err(),
            DownloadAdmissionError::InvalidExpectedSize
        );
        assert_eq!(
            ArtifactDownloadAdmission::new(MAX_UPDATER_ARTIFACT_BYTES + 1, None).unwrap_err(),
            DownloadAdmissionError::InvalidExpectedSize
        );
    }

    #[test]
    fn portable_name_policy_rejects_windows_devices_and_hidden_paths() {
        assert!(is_portable_artifact_name("bandscope-0.1.3.tar.gz"));
        assert!(!is_portable_artifact_name("CON"));
        assert!(!is_portable_artifact_name("com1.exe"));
        assert!(!is_portable_artifact_name(".hidden"));
        assert!(!is_portable_artifact_name("../escape"));
        assert!(!is_portable_artifact_name("name%2fescape"));
    }
}
