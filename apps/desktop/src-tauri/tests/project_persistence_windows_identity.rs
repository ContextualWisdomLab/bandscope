#![cfg(windows)]

#[path = "../src/project_persistence.rs"]
mod project_persistence;

use std::{
    fs::{self, File},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

fn test_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "bandscope-project-windows-identity-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("test directory should be created");
    path
}

#[test]
fn distinct_windows_files_have_distinct_native_identity() {
    let root = test_dir("distinct");
    let left_path = root.join("left.bscope");
    let right_path = root.join("right.bscope");
    let bytes = br#"{\"id\":\"same-size\"}"#;
    fs::write(&left_path, bytes).expect("left fixture should be written");
    fs::write(&right_path, bytes).expect("right fixture should be written");

    let left = File::open(&left_path).expect("left fixture should open");
    let right = File::open(&right_path).expect("right fixture should open");

    assert_ne!(
        project_persistence::windows_file_identity(&left)
            .expect("left native identity should be readable"),
        project_persistence::windows_file_identity(&right)
            .expect("right native identity should be readable"),
        "distinct files with the same bytes must not collapse to one Windows identity"
    );

    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[test]
fn windows_hard_link_aliases_share_native_identity() {
    let root = test_dir("hard-link");
    let original_path = root.join("original.bscope");
    let alias_path = root.join("alias.bscope");
    fs::write(&original_path, br#"{\"id\":\"shared\"}"#)
        .expect("original fixture should be written");
    fs::hard_link(&original_path, &alias_path).expect("hard-link fixture should be created");

    let original = File::open(&original_path).expect("original fixture should open");
    let alias = File::open(&alias_path).expect("alias fixture should open");

    assert_eq!(
        project_persistence::windows_file_identity(&original)
            .expect("original native identity should be readable"),
        project_persistence::windows_file_identity(&alias)
            .expect("alias native identity should be readable"),
        "two handles to one file must report one Windows identity"
    );

    fs::remove_dir_all(root).expect("test directory should be removable");
}
