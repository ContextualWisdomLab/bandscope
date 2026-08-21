#[path = "../src/project_persistence.rs"]
mod project_persistence;

#[cfg(unix)]
#[test]
fn refuses_to_publish_through_symlinked_parent_directory() {
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
        "bandscope-project-persistence-parent-symlink-{}-{nonce}",
        std::process::id()
    ));
    let external = root.join("external");
    let linked_parent = root.join("selected-parent");
    fs::create_dir_all(&external).expect("external fixture directory should be created");
    symlink(&external, &linked_parent).expect("fixture parent symlink should be created");

    let target = linked_parent.join("setlist.bscope");
    let error = project_persistence::publish_new_project_file(
        &target,
        br#"{\"id\":\"must-not-escape\"}"#,
    )
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
fn refuses_to_publish_when_an_ancestor_directory_is_a_symlink() {
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
        "bandscope-project-persistence-ancestor-symlink-{}-{nonce}",
        std::process::id()
    ));
    let actual_tree = root.join("actual");
    let actual_parent = actual_tree.join("nested");
    let selected_tree = root.join("selected");
    let linked_ancestor = selected_tree.join("redirect");
    fs::create_dir_all(&actual_parent).expect("actual fixture tree should be created");
    fs::create_dir_all(&selected_tree).expect("selected fixture tree should be created");
    symlink(&actual_tree, &linked_ancestor).expect("fixture ancestor symlink should be created");

    let target = linked_ancestor.join("nested").join("setlist.bscope");
    let error = project_persistence::publish_new_project_file(
        &target,
        br#"{\"id\":\"ancestor-symlink\"}"#,
    )
    .expect_err("a symlinked save ancestor must be rejected before staging");

    assert_eq!(error, "Could not stage the project safely.");
    assert!(!actual_parent.join("setlist.bscope").exists());
    assert_eq!(
        fs::read_dir(&actual_parent)
            .expect("actual fixture directory should remain readable")
            .count(),
        0,
        "the selected path must not publish through a symlinked ancestor"
    );

    fs::remove_dir_all(root).expect("test fixture should be removable");
}
