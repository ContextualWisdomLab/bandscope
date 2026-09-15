#![cfg(unix)]

use bandscope_distribution_core::ReleaseIdentity;
use bandscope_distribution_state::{load_highest_seen, remember_highest_seen, StateError};
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
            "bandscope-distribution-state-hard-link-{}-{id}",
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
fn hard_linked_state_is_not_accepted_or_mutated() {
    let directory = TestDirectory::new();
    let authority_target = directory.join("authority-target.log");
    let state_path = directory.join("highest-seen.log");
    let first = identity("1.0.0");
    let second = identity("2.0.0");

    remember_highest_seen(&authority_target, &first).expect("fixture state should be created");
    let original = bytes(&authority_target);
    std::fs::hard_link(&authority_target, &state_path).expect("hard-link fixture should be created");

    assert_eq!(load_highest_seen(&state_path), Err(StateError::NotRegularFile));
    assert_eq!(
        remember_highest_seen(&state_path, &second),
        Err(StateError::NotRegularFile)
    );
    assert_eq!(bytes(&authority_target), original);
}
