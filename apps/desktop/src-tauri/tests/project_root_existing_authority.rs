#[cfg(unix)]
#[path = "../src/project_root.rs"]
mod project_root;

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
