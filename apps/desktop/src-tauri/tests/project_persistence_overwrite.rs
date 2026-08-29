#[path = "../src/project_persistence.rs"]
mod project_persistence;

use std::{
    fs, io,
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
        .map(|entry| {
            entry
                .expect("directory entry should be readable")
                .file_name()
        })
        .collect::<Vec<_>>();
    assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);

    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[test]
fn new_project_uses_reserved_rename_when_hard_links_are_unsupported() {
    let root = test_dir("no-hard-link");
    let target = root.join("setlist.bscope");
    let content = br#"{\"id\":\"portable-new-save\"}"#;

    project_persistence::publish_new_project_file_with_linker(
        &target,
        content,
        |_stage, _target| {
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "fixture filesystem has no hard links",
            ))
        },
    )
    .expect("a filesystem without hard links should publish through the reserved rename fallback");

    assert_eq!(
        fs::read(&target).expect("fallback-published project should be readable"),
        content
    );
    let names = fs::read_dir(&root)
        .expect("test directory should be readable")
        .map(|entry| {
            entry
                .expect("directory entry should be readable")
                .file_name()
        })
        .collect::<Vec<_>>();
    assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[test]
fn fallback_never_clobbers_a_target_created_after_hard_link_failure() {
    let root = test_dir("fallback-race");
    let target = root.join("setlist.bscope");
    let content = br#"{\"id\":\"candidate\"}"#;
    let racer = br#"{\"id\":\"racer\"}"#;

    let error = project_persistence::publish_new_project_file_with_linker(
        &target,
        content,
        |_stage, target| {
            fs::write(target, racer)?;
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "hard-link publication became unavailable after a racer won the name",
            ))
        },
    )
    .expect_err("the reserved-rename fallback must not clobber a concurrent target");

    assert_eq!(
        error,
        "Project file already exists. Choose a new file name."
    );
    assert_eq!(
        fs::read(&target).expect("racer project should remain readable"),
        racer
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[test]
fn new_project_never_clobbers_a_target_that_appears_concurrently() {
    let root = test_dir("no-hard-link-race");
    let target = root.join("setlist.bscope");
    let content = br#"{\"id\":\"candidate\"}"#;
    let racer = br#"{\"id\":\"racer\"}"#;

    let error = project_persistence::publish_new_project_file_with_linker(
        &target,
        content,
        |_stage, target| {
            fs::write(target, racer)?;
            Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "racer won the target name",
            ))
        },
    )
    .expect_err("publication must fail closed when another writer wins the target name");

    assert_eq!(
        error,
        "Project file already exists. Choose a new file name."
    );
    assert_eq!(
        fs::read(&target).expect("racer project should remain readable"),
        racer
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn existing_project_never_clobbers_a_target_swapped_after_authority_snapshot() {
    let root = test_dir("existing-target-race");
    let target = root.join("setlist.bscope");
    let parked = root.join("parked-authorized.bscope");
    let stage = root.join("candidate.stage");
    let authorized = br#"{\"id\":\"authorized\"}"#;
    let racer = br#"{\"id\":\"racer\"}"#;
    let candidate = br#"{\"id\":\"candidate\"}"#;
    fs::write(&target, authorized).expect("authorized fixture should be written");
    fs::write(&stage, candidate).expect("candidate stage should be written");

    let expected = project_persistence::project_file_identity(&target)
        .expect("the selected target identity should be capturable");
    fs::rename(&target, &parked).expect("authorized target should be parked by the racer");
    fs::write(&target, racer).expect("racer should replace the selected pathname");

    let error = project_persistence::replace_existing_project_file(&stage, &target, &expected)
        .expect_err("replacement must fail closed when target identity changed after validation");

    assert_eq!(error, "Could not publish the project safely.");
    assert_eq!(
        fs::read(&target).expect("racer target should remain readable"),
        racer,
        "the save must not clobber a different file that won the pathname"
    );
    assert_eq!(
        fs::read(&parked).expect("authorized project should remain readable"),
        authorized
    );
    assert!(
        !stage.exists(),
        "the rejected candidate stage should be cleaned after a successful rollback"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}
