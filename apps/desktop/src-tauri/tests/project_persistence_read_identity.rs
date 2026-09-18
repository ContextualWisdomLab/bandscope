//! Regression coverage for read-handle-bound project predecessor identity.

#[path = "../src/project_persistence.rs"]
mod project_persistence;

use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

fn test_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "bandscope-project-read-identity-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("test directory should be created");
    path
}

#[cfg(any(unix, windows))]
#[test]
fn bounded_read_retains_the_opened_predecessor_identity_after_path_replacement() {
    let root = test_dir("path-replacement");
    let selected = root.join("selected.bscope");
    let parked = root.join("parked.bscope");
    let replacement = root.join("replacement.bscope");
    let original = r#"{"id":"original"}"#;
    let competing = r#"{"id":"competing"}"#;

    fs::write(&selected, original).expect("original project should be written");
    fs::write(&replacement, competing).expect("competing project should be written");

    let read = project_persistence::read_project_file_with_identity(&selected)
        .expect("bounded project read should return content and opened-file identity");

    fs::rename(&selected, &parked).expect("the original project should be parked");
    fs::rename(&replacement, &selected).expect("the competing project should take the path");

    let parked_identity = project_persistence::project_file_identity(&parked)
        .expect("parked original identity should be readable");
    let competing_identity = project_persistence::project_file_identity(&selected)
        .expect("competing target identity should be readable");

    assert_eq!(read.content(), original);
    assert_eq!(read.identity(), &parked_identity);
    assert_ne!(read.identity(), &competing_identity);

    fs::remove_dir_all(root).expect("test directory should be removable");
}
