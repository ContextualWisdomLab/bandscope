//! Durable local freshness state for BandScope's Distribution/update boundary.
//!
//! This crate owns only the locally persisted highest authenticated release
//! identity used by the anti-replay decision core. It does not fetch update
//! metadata, verify Tauri signatures, install software, or write BandScope
//! project data. The on-disk format is append-only so a torn final write can be
//! discarded without losing the previous committed release identity.

#![forbid(unsafe_code)]

use bandscope_distribution_core::ReleaseIdentity;
use std::fs::{File, OpenOptions, TryLockError};
use std::io::{Read, Write};
use std::path::Path;

/// Maximum accepted state-log size.
pub const MAX_STATE_BYTES: usize = 64 * 1024;

const RECORD_PREFIX: &str = "v1|";
const MAX_RECORD_BYTES: usize = 192;
const STATE_LEASE_FILE_NAME: &str = ".bandscope-highest-seen.lock";

/// Successful result of remembering an authenticated release identity.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RememberOutcome {
    /// The new highest authenticated identity was appended and synchronized.
    Remembered,
    /// The exact identity was already the committed highest-seen release.
    AlreadyRemembered,
}

/// Fail-closed durable-state errors.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StateError {
    /// A local filesystem operation failed.
    Io,
    /// The configured state path is a link or is not a regular file.
    NotRegularFile,
    /// The state log exceeded its bounded storage budget.
    TooLarge,
    /// A committed record or unrecoverable trailing fragment is malformed.
    Corrupt,
    /// A caller attempted to remember a release older than local authority.
    Replay,
    /// The same release version was presented with different immutable identity.
    Equivocation,
    /// Another process owns the state lease or bytes changed during admission.
    ConcurrentMutation,
}

/// Load the highest committed authenticated release identity from local state.
///
/// Access is serialized through a sibling OS file lease so a reader cannot
/// observe a stale highest-seen snapshot while another process is appending a
/// newer authenticated release. A final non-newline-terminated fragment is
/// treated as recoverable only when every byte is a valid prefix of one state
/// record. This is the sole torn-write case accepted. Malformed committed
/// records fail closed rather than silently discarding anti-replay evidence.
pub fn load_highest_seen(path: &Path) -> Result<Option<ReleaseIdentity>, StateError> {
    let _lease = acquire_state_lease(path)?;
    let bytes = read_state_bytes(path)?.unwrap_or_default();
    parse_state_bytes(&bytes).map(|parsed| parsed.highest)
}

/// Remember a newly authenticated release identity in an append-only state log.
///
/// The caller must invoke this only after updater metadata and artifact
/// authenticity have been established. One sibling OS file lease is held from
/// the first state read through tail repair, append, and synchronization so two
/// app processes cannot append from the same stale snapshot. The record is
/// appended, flushed and synchronized before success is returned. If a previous
/// process was torn during its final append, the validated incomplete tail is
/// truncated first; committed records are never rewritten.
pub fn remember_highest_seen(
    path: &Path,
    identity: &ReleaseIdentity,
) -> Result<RememberOutcome, StateError> {
    let _lease = acquire_state_lease(path)?;
    let original = read_state_bytes(path)?;
    let bytes = original.as_deref().unwrap_or(&[]);
    let parsed = parse_state_bytes(bytes)?;

    if let Some(highest) = parsed.highest.as_ref() {
        if identity.version() < highest.version() {
            return Err(StateError::Replay);
        }
        if identity.version() == highest.version() {
            if identity != highest {
                return Err(StateError::Equivocation);
            }
            if parsed.committed_len != bytes.len() {
                truncate_recoverable_tail(path, parsed.committed_len)?;
            }
            return Ok(RememberOutcome::AlreadyRemembered);
        }
    }

    if parsed.committed_len != bytes.len() {
        truncate_recoverable_tail(path, parsed.committed_len)?;
    }

    let record = encode_record(identity);
    if parsed
        .committed_len
        .checked_add(record.len())
        .is_none_or(|next_len| next_len > MAX_STATE_BYTES)
    {
        return Err(StateError::TooLarge);
    }

    let existed = original.is_some();
    let mut file = open_for_append(path, existed)?;
    let current_len = file.metadata().map_err(|_| StateError::Io)?.len() as usize;
    if current_len != parsed.committed_len {
        return Err(StateError::ConcurrentMutation);
    }

    file.write_all(record.as_bytes()).map_err(|_| StateError::Io)?;
    file.sync_all().map_err(|_| StateError::Io)?;
    let expected_len = parsed.committed_len + record.len();
    if file.metadata().map_err(|_| StateError::Io)?.len() as usize != expected_len {
        return Err(StateError::ConcurrentMutation);
    }

    #[cfg(unix)]
    if !existed {
        let parent = path.parent().ok_or(StateError::Io)?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| StateError::Io)?;
    }

    Ok(RememberOutcome::Remembered)
}

#[derive(Debug)]
struct ParsedState {
    highest: Option<ReleaseIdentity>,
    committed_len: usize,
}

fn acquire_state_lease(path: &Path) -> Result<File, StateError> {
    let parent = path.parent().ok_or(StateError::Io)?;
    let lease_path = parent.join(STATE_LEASE_FILE_NAME);
    let lease_file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&lease_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = std::fs::symlink_metadata(&lease_path).map_err(|_| StateError::Io)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(StateError::NotRegularFile);
            }
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(&lease_path)
                .map_err(|_| StateError::Io)?
        }
        Err(_) => return Err(StateError::Io),
    };

    match lease_file.try_lock() {
        Ok(()) => Ok(lease_file),
        Err(TryLockError::WouldBlock) => Err(StateError::ConcurrentMutation),
        Err(TryLockError::Error(_)) => Err(StateError::Io),
    }
}

fn read_state_bytes(path: &Path) -> Result<Option<Vec<u8>>, StateError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(StateError::Io),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(StateError::NotRegularFile);
    }
    if metadata.len() as usize > MAX_STATE_BYTES {
        return Err(StateError::TooLarge);
    }

    let mut file = File::open(path).map_err(|_| StateError::Io)?;
    let opened = file.metadata().map_err(|_| StateError::Io)?;
    if !opened.is_file() || opened.len() != metadata.len() {
        return Err(StateError::ConcurrentMutation);
    }

    let mut bytes = Vec::with_capacity(opened.len() as usize);
    Read::by_ref(&mut file)
        .take((MAX_STATE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| StateError::Io)?;
    if bytes.len() > MAX_STATE_BYTES {
        return Err(StateError::TooLarge);
    }
    if file.metadata().map_err(|_| StateError::Io)?.len() as usize != bytes.len() {
        return Err(StateError::ConcurrentMutation);
    }
    Ok(Some(bytes))
}

fn parse_state_bytes(bytes: &[u8]) -> Result<ParsedState, StateError> {
    let committed_len = match bytes.iter().rposition(|byte| *byte == b'\n') {
        Some(index) => index + 1,
        None => 0,
    };
    let tail = &bytes[committed_len..];
    if !tail.is_empty() && !is_recoverable_record_prefix(tail) {
        return Err(StateError::Corrupt);
    }

    let committed = std::str::from_utf8(&bytes[..committed_len]).map_err(|_| StateError::Corrupt)?;
    let mut highest: Option<ReleaseIdentity> = None;
    for line in committed.lines() {
        let identity = parse_record(line)?;
        if let Some(previous) = highest.as_ref() {
            if identity.version() < previous.version() {
                return Err(StateError::Corrupt);
            }
            if identity.version() == previous.version() {
                return Err(StateError::Corrupt);
            }
        }
        highest = Some(identity);
    }

    Ok(ParsedState {
        highest,
        committed_len,
    })
}

fn parse_record(line: &str) -> Result<ReleaseIdentity, StateError> {
    if line.len() > MAX_RECORD_BYTES {
        return Err(StateError::Corrupt);
    }
    let mut fields = line.split('|');
    if fields.next() != Some("v1") {
        return Err(StateError::Corrupt);
    }
    let version = fields.next().ok_or(StateError::Corrupt)?;
    let source_commit = fields.next().ok_or(StateError::Corrupt)?;
    let artifact_sha256 = fields.next().ok_or(StateError::Corrupt)?;
    if fields.next().is_some() {
        return Err(StateError::Corrupt);
    }
    ReleaseIdentity::new(version, source_commit, artifact_sha256).map_err(|_| StateError::Corrupt)
}

fn encode_record(identity: &ReleaseIdentity) -> String {
    let (major, minor, patch) = identity.version().components();
    format!(
        "v1|{major}.{minor}.{patch}|{}|{}\n",
        identity.source_commit(),
        identity.artifact_sha256()
    )
}

fn is_recoverable_record_prefix(bytes: &[u8]) -> bool {
    if bytes.len() > MAX_RECORD_BYTES || bytes.contains(&b'\n') {
        return false;
    }
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    if text.len() < RECORD_PREFIX.len() {
        return RECORD_PREFIX.starts_with(text);
    }
    if !text.starts_with(RECORD_PREFIX) {
        return false;
    }

    let fields: Vec<&str> = text.split('|').collect();
    if fields.len() > 4 || fields.first().copied() != Some("v1") {
        return false;
    }
    if let Some(version) = fields.get(1) {
        if !is_version_prefix(version) {
            return false;
        }
    }
    if let Some(source) = fields.get(2) {
        if source.len() > 40 || !source.bytes().all(is_lower_hex) {
            return false;
        }
    }
    if let Some(digest) = fields.get(3) {
        if digest.len() > 64 || !digest.bytes().all(is_lower_hex) {
            return false;
        }
    }
    true
}

fn is_version_prefix(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    if !value.bytes().all(|byte| byte.is_ascii_digit() || byte == b'.') {
        return false;
    }
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() > 3 {
        return false;
    }
    for (index, part) in parts.iter().enumerate() {
        if part.len() > 20 {
            return false;
        }
        if part.len() > 1 && part.starts_with('0') {
            return false;
        }
        if part.is_empty() && index + 1 != parts.len() {
            return false;
        }
        if !part.is_empty() && part.parse::<u64>().is_err() {
            return false;
        }
    }
    true
}

fn is_lower_hex(byte: u8) -> bool {
    byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')
}

fn truncate_recoverable_tail(path: &Path, committed_len: usize) -> Result<(), StateError> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| StateError::Io)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(StateError::NotRegularFile);
    }
    let file = OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|_| StateError::Io)?;
    if file.metadata().map_err(|_| StateError::Io)?.len() as usize < committed_len {
        return Err(StateError::ConcurrentMutation);
    }
    file.set_len(committed_len as u64)
        .map_err(|_| StateError::Io)?;
    file.sync_all().map_err(|_| StateError::Io)
}

fn open_for_append(path: &Path, existed: bool) -> Result<File, StateError> {
    if existed {
        let metadata = std::fs::symlink_metadata(path).map_err(|_| StateError::Io)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(StateError::NotRegularFile);
        }
        OpenOptions::new()
            .append(true)
            .open(path)
            .map_err(|_| StateError::Io)
    } else {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|_| StateError::Io)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    const SOURCE_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const SOURCE_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const DIGEST_A: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const DIGEST_B: &str =
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(1);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "bandscope-distribution-state-{}-{id}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }

        fn state_path(&self) -> PathBuf {
            self.0.join("highest-seen.log")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn identity(version: &str) -> ReleaseIdentity {
        ReleaseIdentity::new(version, SOURCE_A, DIGEST_A).expect("fixture identity should be valid")
    }

    #[test]
    fn absent_state_loads_as_none() {
        let directory = TestDirectory::new();
        assert_eq!(load_highest_seen(&directory.state_path()), Ok(None));
    }

    #[test]
    fn append_log_remembers_monotonic_highest_identity() {
        let directory = TestDirectory::new();
        let path = directory.state_path();
        let first = identity("1.0.0");
        let second = identity("2.0.0");

        assert_eq!(
            remember_highest_seen(&path, &first),
            Ok(RememberOutcome::Remembered)
        );
        assert_eq!(load_highest_seen(&path), Ok(Some(first)));
        assert_eq!(
            remember_highest_seen(&path, &second),
            Ok(RememberOutcome::Remembered)
        );
        assert_eq!(load_highest_seen(&path), Ok(Some(second)));
    }

    #[test]
    fn exact_repeat_is_idempotent_without_growing_log() {
        let directory = TestDirectory::new();
        let path = directory.state_path();
        let release = identity("1.2.3");
        remember_highest_seen(&path, &release).expect("first append should succeed");
        let original_len = std::fs::metadata(&path).expect("state metadata").len();

        assert_eq!(
            remember_highest_seen(&path, &release),
            Ok(RememberOutcome::AlreadyRemembered)
        );
        assert_eq!(
            std::fs::metadata(&path).expect("state metadata").len(),
            original_len
        );
    }

    #[test]
    fn replay_and_same_version_equivocation_fail_closed() {
        let directory = TestDirectory::new();
        let path = directory.state_path();
        let highest = identity("2.0.0");
        remember_highest_seen(&path, &highest).expect("highest append should succeed");

        assert_eq!(remember_highest_seen(&path, &identity("1.9.9")), Err(StateError::Replay));
        let conflicting = ReleaseIdentity::new("2.0.0", SOURCE_B, DIGEST_B)
            .expect("conflicting identity should be structurally valid");
        assert_eq!(
            remember_highest_seen(&path, &conflicting),
            Err(StateError::Equivocation)
        );
        assert_eq!(load_highest_seen(&path), Ok(Some(highest)));
    }

    #[test]
    fn recoverable_torn_tail_keeps_previous_record_and_is_repaired_on_append() {
        let directory = TestDirectory::new();
        let path = directory.state_path();
        let first = identity("1.0.0");
        let second = identity("2.0.0");
        remember_highest_seen(&path, &first).expect("first append should succeed");

        let mut file = OpenOptions::new()
            .append(true)
            .open(&path)
            .expect("test state should open");
        file.write_all(b"v1|2.0").expect("partial tail should write");
        file.sync_all().expect("partial tail should sync for the fixture");

        assert_eq!(load_highest_seen(&path), Ok(Some(first)));
        assert_eq!(
            remember_highest_seen(&path, &second),
            Ok(RememberOutcome::Remembered)
        );
        assert_eq!(load_highest_seen(&path), Ok(Some(second)));
        let bytes = std::fs::read(&path).expect("state should be readable");
        assert!(bytes.ends_with(b"\n"));
        assert!(!String::from_utf8(bytes).expect("state should be utf-8").contains("v1|2.0v1|"));
    }

    #[test]
    fn malformed_committed_record_and_invalid_tail_are_rejected() {
        let directory = TestDirectory::new();
        let path = directory.state_path();
        std::fs::write(&path, b"broken\n").expect("fixture should write");
        assert_eq!(load_highest_seen(&path), Err(StateError::Corrupt));

        std::fs::write(&path, b"v1|1.0.0|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\ngarbage")
            .expect("fixture should write");
        assert_eq!(load_highest_seen(&path), Err(StateError::Corrupt));
    }

    #[test]
    fn non_regular_and_oversized_state_are_rejected() {
        let directory = TestDirectory::new();
        assert_eq!(load_highest_seen(&directory.0), Err(StateError::NotRegularFile));

        let path = directory.state_path();
        std::fs::write(&path, vec![b'x'; MAX_STATE_BYTES + 1]).expect("oversized fixture should write");
        assert_eq!(load_highest_seen(&path), Err(StateError::TooLarge));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_state_is_rejected() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let target = directory.0.join("target.log");
        std::fs::write(&target, b"").expect("target should write");
        let path = directory.state_path();
        symlink(&target, &path).expect("symlink fixture should be created");
        assert_eq!(load_highest_seen(&path), Err(StateError::NotRegularFile));
    }
}
