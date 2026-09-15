use bandscope_distribution_state::{load_highest_seen, StateError};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(1);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "bandscope-distribution-state-impossible-tail-{}-{id}",
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

#[test]
fn impossible_u64_version_component_is_not_recoverable_torn_tail() {
    let directory = TestDirectory::new();
    let path = directory.state_path();

    for tail in [
        b"v1|18446744073709551616".as_slice(),
        b"v1|1.18446744073709551616".as_slice(),
        b"v1|1.2.18446744073709551616".as_slice(),
    ] {
        std::fs::write(&path, tail).expect("fixture should write");
        assert_eq!(load_highest_seen(&path), Err(StateError::Corrupt));
    }
}

#[test]
fn still_extendable_version_prefix_remains_recoverable() {
    let directory = TestDirectory::new();
    let path = directory.state_path();

    for tail in [
        b"v1|2.0".as_slice(),
        b"v1|18446744073709551615".as_slice(),
    ] {
        std::fs::write(&path, tail).expect("fixture should write");
        assert_eq!(load_highest_seen(&path), Ok(None));
    }
}
