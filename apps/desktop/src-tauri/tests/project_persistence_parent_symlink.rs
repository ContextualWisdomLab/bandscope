#[path = "../src/project_persistence.rs"]
mod project_persistence;

#[cfg(unix)]
fn fixture_root(label: &str) -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-project-persistence-{label}-{}-{nonce}",
        std::process::id()
    ));
    std::fs::create_dir_all(&root).expect("fixture root should be created");
    root
}

#[cfg(unix)]
#[test]
fn refuses_to_publish_through_symlinked_parent_directory() {
    use std::{fs, os::unix::fs::symlink};

    let root = fixture_root("parent-symlink");
    let external = root.join("external");
    let linked_parent = root.join("selected-parent");
    fs::create_dir_all(&external).expect("external fixture directory should be created");
    symlink(&external, &linked_parent).expect("fixture parent symlink should be created");

    let target = linked_parent.join("setlist.bscope");
    let error =
        project_persistence::publish_new_project_file(&target, br#"{\"id\":\"must-not-escape\"}"#)
            .expect_err("a symlinked save parent must not redirect project publication");

    assert_eq!(error, "Could not stage the project safely.");
    assert!(!external.join("setlist.bscope").exists());
    assert_eq!(
        fs::read_dir(&external)
            .expect("external fixture directory should remain readable")
            .count(),
        0,
        "no staging or published artifact may escape through the symlinked parent"
    );

    fs::remove_dir_all(root).expect("test fixture should be removable");
}

#[cfg(unix)]
#[test]
fn refuses_to_publish_through_symlinked_ancestor_directory() {
    use std::{fs, os::unix::fs::symlink};

    let root = fixture_root("ancestor-symlink");
    let external = root.join("external");
    let external_parent = external.join("nested-parent");
    let linked_ancestor = root.join("selected-root");
    fs::create_dir_all(&external_parent).expect("external nested directory should be created");
    symlink(&external, &linked_ancestor).expect("fixture ancestor symlink should be created");

    let target = linked_ancestor.join("nested-parent").join("setlist.bscope");
    let error =
        project_persistence::publish_new_project_file(&target, br#"{\"id\":\"must-not-escape\"}"#)
            .expect_err("a linked ancestor must not redirect project publication");

    assert_eq!(error, "Could not stage the project safely.");
    assert!(!external_parent.join("setlist.bscope").exists());
    assert_eq!(
        fs::read_dir(&external_parent)
            .expect("external nested directory should remain readable")
            .count(),
        0,
        "no staging or published artifact may escape through a linked ancestor"
    );

    fs::remove_dir_all(root).expect("test fixture should be removable");
}
