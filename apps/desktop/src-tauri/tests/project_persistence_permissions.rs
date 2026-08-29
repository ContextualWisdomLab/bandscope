#[path = "../src/project_persistence.rs"]
mod project_persistence;

#[cfg(unix)]
#[test]
fn existing_project_overwrite_preserves_restrictive_mode() {
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-project-permissions-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&root).expect("test directory should be created");
    let target = root.join("private.bscope");
    fs::write(&target, br#"{"id":"private-old"}"#).expect("fixture should be written");
    fs::set_permissions(&target, fs::Permissions::from_mode(0o600))
        .expect("fixture should be restricted to its owner");

    project_persistence::publish_new_project_file(&target, br#"{"id":"private-new"}"#)
        .expect("existing private project should be replaced safely");

    let mode = fs::metadata(&target)
        .expect("replacement should be readable")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(
        mode, 0o600,
        "staged replacement must not widen an existing project's Unix permissions"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(unix)]
#[test]
fn existing_project_overwrite_strips_executable_bits() {
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-project-permissions-executable-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&root).expect("test directory should be created");
    let target = root.join("project.bscope");
    fs::write(&target, br#"{"id":"executable-old"}"#).expect("fixture should be written");
    fs::set_permissions(&target, fs::Permissions::from_mode(0o755))
        .expect("fixture should be executable");

    project_persistence::publish_new_project_file(&target, br#"{"id":"data-new"}"#)
        .expect("existing executable project should be replaced safely");

    let mode = fs::metadata(&target)
        .expect("replacement should be readable")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o644, "project data must not retain executable bits");
    fs::remove_dir_all(root).expect("test directory should be removable");
}
