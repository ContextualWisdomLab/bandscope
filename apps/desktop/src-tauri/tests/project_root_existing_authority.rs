#[path = "../src/project_root.rs"]
mod project_root;

#[test]
fn ordinary_app_local_base_provisions_one_new_project_root_without_reuse() {
    use std::fs;

    let test_root = std::env::temp_dir().join(format!(
        "bandscope-project-root-provisioning-positive-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let base_root = test_root.join("app-local").join("BandScope");
    let project_id = "project-1-1";

    let created = project_root::provision_new_project_root(&base_root, project_id)
        .expect("ordinary missing app-local components should be provisioned");
    assert_eq!(created, base_root.join(project_id));
    assert!(created.is_dir(), "new project root should be a real directory");
    assert!(
        project_root::provision_new_project_root(&base_root, project_id).is_err(),
        "new-project provisioning must not silently reuse an existing project root"
    );

    fs::remove_dir_all(&test_root).expect("test directory should be removable");
}

#[cfg(unix)]
#[test]
fn linked_app_local_base_cannot_authorize_a_project_root() {
    use std::{fs, os::unix::fs::symlink};

    let test_root = std::env::temp_dir().join(format!(
        "bandscope-project-root-authority-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let real_app_local_base = test_root.join("real-app-local");
    let linked_app_local_base = test_root.join("linked-app-local");
    let project_id = "project-1-1";

    fs::create_dir_all(real_app_local_base.join(project_id))
        .expect("real app-local project directory should be created");
    symlink(&real_app_local_base, &linked_app_local_base)
        .expect("linked app-local base should be created");

    assert!(
        project_root::resolve_existing_project_root(&linked_app_local_base, project_id).is_err(),
        "a symlinked app-local base must not become native project authority"
    );

    fs::remove_dir_all(&test_root).expect("test directory should be removable");
}

#[cfg(unix)]
#[test]
fn linked_app_local_base_cannot_provision_a_new_project_root() {
    use std::{fs, os::unix::fs::symlink};

    let test_root = std::env::temp_dir().join(format!(
        "bandscope-project-root-provisioning-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let real_app_local_base = test_root.join("real-app-local");
    let linked_app_local_base = test_root.join("linked-app-local");
    let project_id = "project-1-1";

    fs::create_dir_all(&real_app_local_base)
        .expect("real app-local base should be created");
    symlink(&real_app_local_base, &linked_app_local_base)
        .expect("linked app-local base should be created");

    assert!(
        project_root::provision_new_project_root(&linked_app_local_base, project_id).is_err(),
        "a symlinked app-local base must not redirect new project provisioning"
    );
    assert!(
        !real_app_local_base.join(project_id).exists(),
        "rejected provisioning must not create a project through the linked base"
    );

    fs::remove_dir_all(&test_root).expect("test directory should be removable");
}

#[cfg(windows)]
#[test]
fn reparse_app_local_base_cannot_authorize_a_project_root() {
    use std::{fs, process::Command};

    let test_root = std::env::temp_dir().join(format!(
        "bandscope-project-root-authority-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let real_app_local_base = test_root.join("real-app-local");
    let linked_app_local_base = test_root.join("linked-app-local");
    let project_id = "project-1-1";

    fs::create_dir_all(real_app_local_base.join(project_id))
        .expect("real app-local project directory should be created");
    let junction = Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&linked_app_local_base)
        .arg(&real_app_local_base)
        .status()
        .expect("junction command should start");
    assert!(junction.success(), "junction fixture should be created");

    assert!(
        project_root::resolve_existing_project_root(&linked_app_local_base, project_id).is_err(),
        "a reparse app-local base must not become native project authority"
    );

    fs::remove_dir(&linked_app_local_base).expect("junction should be removable");
    fs::remove_dir_all(&test_root).expect("test directory should be removable");
}

#[cfg(windows)]
#[test]
fn reparse_app_local_base_cannot_provision_a_new_project_root() {
    use std::{fs, process::Command};

    let test_root = std::env::temp_dir().join(format!(
        "bandscope-project-root-provisioning-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let real_app_local_base = test_root.join("real-app-local");
    let linked_app_local_base = test_root.join("linked-app-local");
    let project_id = "project-1-1";

    fs::create_dir_all(&real_app_local_base).expect("real app-local base should be created");
    let junction = Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&linked_app_local_base)
        .arg(&real_app_local_base)
        .status()
        .expect("junction command should start");
    assert!(junction.success(), "junction fixture should be created");

    assert!(
        project_root::provision_new_project_root(&linked_app_local_base, project_id).is_err(),
        "a reparse app-local base must not redirect new project provisioning"
    );
    assert!(
        !real_app_local_base.join(project_id).exists(),
        "rejected provisioning must not create a project through the reparse base"
    );

    fs::remove_dir(&linked_app_local_base).expect("junction should be removable");
    fs::remove_dir_all(&test_root).expect("test directory should be removable");
}
