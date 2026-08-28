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
        "bandscope-project-overwrite-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("test directory should be created");
    path
}

#[test]
fn confirmed_existing_project_is_replaced_after_new_bytes_are_staged() {
    let root = test_dir("confirmed");
    let target = root.join("setlist.bscope");
    let known_good = br#"{\"id\":\"known-good\"}"#;
    let replacement = br#"{\"id\":\"replacement\"}"#;
    fs::write(&target, known_good).expect("known-good fixture should be written");

    project_persistence::publish_new_project_file(&target, replacement)
        .expect("a save-dialog-confirmed regular project should be replaceable");

    assert_eq!(
        fs::read(&target).expect("replacement project should be readable"),
        replacement
    );
    let names = fs::read_dir(&root)
        .expect("test directory should be readable")
        .map(|entry| entry.expect("directory entry should be readable").file_name())
        .collect::<Vec<_>>();
    assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);

    fs::remove_dir_all(root).expect("test directory should be removable");
}
