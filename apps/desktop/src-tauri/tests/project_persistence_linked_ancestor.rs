#[cfg(unix)]
#[path = "../src/project_persistence.rs"]
mod project_persistence;

#[cfg(unix)]
#[test]
fn regular_project_under_symlinked_ancestor_reads_without_recovery_state() {
    use std::{fs, os::unix::fs::symlink};

    let root = std::env::temp_dir().join(format!(
        "bandscope-linked-ancestor-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let real_parent = root.join("real");
    let linked_parent = root.join("linked");
    fs::create_dir_all(&real_parent).expect("real project directory should be created");
    symlink(&real_parent, &linked_parent).expect("linked project directory should be created");

    let real_target = real_parent.join("setlist.bscope");
    let selected_target = linked_parent.join("setlist.bscope");
    let content = r#"{"id":"linked-folder-project"}"#;
    fs::write(&real_target, content).expect("project fixture should be written");

    project_persistence::recover_project_publication(&selected_target)
        .expect("no recovery journal should not reject an otherwise readable linked-folder project");
    assert_eq!(
        project_persistence::read_project_file(&selected_target)
            .expect("the final regular project file should remain readable"),
        content
    );

    fs::remove_dir_all(&root).expect("test directory should be removable");
}
