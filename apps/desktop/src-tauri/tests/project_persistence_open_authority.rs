#[path = "../src/project_persistence.rs"]
mod project_persistence;

#[cfg(unix)]
#[test]
fn unix_project_opener_refuses_symlink_at_handle_acquisition() {
    use std::{
        fs,
        os::unix::fs::symlink,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-project-open-authority-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&root).expect("test directory should be created");
    let external = root.join("external.bscope");
    let selected = root.join("selected.bscope");
    fs::write(&external, br#"{\"id\":\"external\"}"#).expect("external fixture should be written");
    symlink(&external, &selected).expect("fixture symlink should be created");

    let opened = project_persistence::open_project_file(&selected);

    assert!(
        opened.is_err(),
        "Unix project handle acquisition must not follow a selected-path symlink"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn app_owned_source_opener_returns_the_exact_regular_artifact() {
    use std::{
        io::Read,
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-source-open-authority-{}-{nonce}",
        std::process::id()
    ));
    let project_root = root.join("project-1-1");
    fs::create_dir_all(&project_root).expect("project root should be created");
    let source_path = project_root.join("source.wav");
    let source_bytes = b"RIFF-safe-reopen-fixture";
    fs::write(&source_path, source_bytes).expect("source fixture should be written");

    let mut opened = project_persistence::open_app_owned_source_file(&project_root, "source.wav")
        .expect("the exact regular app-owned source should be opened");
    let mut observed = Vec::new();
    opened
        .read_to_end(&mut observed)
        .expect("opened source should remain readable");

    assert_eq!(observed, source_bytes);
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[test]
fn app_owned_source_opener_rejects_artifact_traversal_before_reading() {
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-source-open-traversal-{}-{nonce}",
        std::process::id()
    ));
    let project_root = root.join("project-1-1");
    fs::create_dir_all(&project_root).expect("project root should be created");
    fs::write(root.join("external.wav"), b"outside-project")
        .expect("external fixture should be written");

    let error = project_persistence::open_app_owned_source_file(&project_root, "../external.wav")
        .expect_err("persisted artifact evidence must not create path traversal authority");

    assert_eq!(error, "Could not prepare the local project workspace.");
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(unix)]
#[test]
fn app_owned_source_opener_refuses_a_symlink_artifact() {
    use std::{
        fs,
        os::unix::fs::symlink,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-source-open-symlink-{}-{nonce}",
        std::process::id()
    ));
    let project_root = root.join("project-1-1");
    fs::create_dir_all(&project_root).expect("project root should be created");
    let external = root.join("external.wav");
    let source_path = project_root.join("source.wav");
    fs::write(&external, b"outside-project").expect("external fixture should be written");
    symlink(&external, &source_path).expect("source symlink should be created");

    let error = project_persistence::open_app_owned_source_file(&project_root, "source.wav")
        .expect_err("app-owned source authority must not follow a symlink artifact");

    assert_eq!(error, "Could not prepare the local project workspace.");
    fs::remove_dir_all(root).expect("test directory should be removable");
}
