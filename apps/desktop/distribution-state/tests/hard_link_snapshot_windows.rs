#![cfg(windows)]

use bandscope_distribution_core::ReleaseIdentity;
use bandscope_distribution_state::{load_highest_seen, remember_highest_seen, RememberOutcome};
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const SOURCE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIGEST: &str =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(1);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "bandscope-distribution-state-windows-hard-link-{}-{id}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    fn join(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn identity(version: &str) -> ReleaseIdentity {
    ReleaseIdentity::new(version, SOURCE, DIGEST).expect("fixture identity should be valid")
}

fn bytes(path: &Path) -> Vec<u8> {
    std::fs::read(path).expect("fixture should remain readable")
}

#[test]
fn monotonic_update_replaces_state_path_without_mutating_hard_link_alias() {
    let directory = TestDirectory::new();
    let authority_target = directory.join("authority-target.log");
    let state_path = directory.join("highest-seen.log");
    let first = identity("1.0.0");
    let second = identity("2.0.0");

    remember_highest_seen(&authority_target, &first).expect("fixture state should be created");
    let original_alias_bytes = bytes(&authority_target);
    std::fs::hard_link(&authority_target, &state_path).expect("hard-link fixture should be created");

    assert_eq!(load_highest_seen(&state_path), Ok(Some(first.clone())));
    assert_eq!(
        remember_highest_seen(&state_path, &second),
        Ok(RememberOutcome::Remembered)
    );
    assert_eq!(load_highest_seen(&state_path), Ok(Some(second)));
    assert_eq!(bytes(&authority_target), original_alias_bytes);
}

#[test]
fn torn_tail_repair_replaces_state_path_without_truncating_hard_link_alias() {
    let directory = TestDirectory::new();
    let authority_target = directory.join("authority-target.log");
    let state_path = directory.join("highest-seen.log");
    let first = identity("1.0.0");

    remember_highest_seen(&authority_target, &first).expect("fixture state should be created");
    let mut alias_writer = std::fs::OpenOptions::new()
        .append(true)
        .open(&authority_target)
        .expect("fixture alias should open");
    alias_writer
        .write_all(b"v1|2.0")
        .expect("recoverable tail should be written");
    alias_writer.sync_all().expect("fixture tail should sync");
    drop(alias_writer);

    let alias_with_tail = bytes(&authority_target);
    std::fs::hard_link(&authority_target, &state_path).expect("hard-link fixture should be created");

    assert_eq!(load_highest_seen(&state_path), Ok(Some(first.clone())));
    assert_eq!(
        remember_highest_seen(&state_path, &first),
        Ok(RememberOutcome::AlreadyRemembered)
    );
    assert_eq!(load_highest_seen(&state_path), Ok(Some(first)));
    assert_eq!(bytes(&authority_target), alias_with_tail);
    assert!(!bytes(&state_path).ends_with(b"v1|2.0"));
}
