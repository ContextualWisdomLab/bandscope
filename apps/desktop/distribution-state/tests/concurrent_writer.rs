//! Cross-process lease contract for Distribution highest-seen freshness state.

use bandscope_distribution_core::ReleaseIdentity;
use bandscope_distribution_state::{
    load_highest_seen, remember_highest_seen, RememberOutcome, StateError,
};
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const SOURCE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STATE_LEASE_FILE_NAME: &str = ".bandscope-highest-seen.lock";
static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(1);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "bandscope-distribution-state-lease-{}-{id}",
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

fn lease_path(state_path: &Path) -> PathBuf {
    state_path
        .parent()
        .expect("test state has a parent")
        .join(STATE_LEASE_FILE_NAME)
}

fn identity(version: &str) -> ReleaseIdentity {
    ReleaseIdentity::new(version, SOURCE, DIGEST).expect("fixture identity should be valid")
}

#[test]
fn active_cross_process_lease_blocks_stale_read_and_competing_append() {
    let directory = TestDirectory::new();
    let state_path = directory.state_path();
    let lease_path = lease_path(&state_path);
    let lease = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&lease_path)
        .expect("lease fixture should open");
    lease.try_lock().expect("fixture should own the state lease");

    assert_eq!(
        load_highest_seen(&state_path),
        Err(StateError::ConcurrentMutation)
    );
    assert_eq!(
        remember_highest_seen(&state_path, &identity("1.0.0")),
        Err(StateError::ConcurrentMutation)
    );
    assert!(
        !state_path.exists(),
        "competing writer must not create freshness state while the lease is held"
    );

    drop(lease);
    assert_eq!(
        remember_highest_seen(&state_path, &identity("1.0.0")),
        Ok(RememberOutcome::Remembered)
    );
    assert_eq!(load_highest_seen(&state_path), Ok(Some(identity("1.0.0"))));
}
