#[cfg(unix)]
mod project_persistence {
    include!("../src/project_persistence.rs");

    pub(crate) fn open_for_authority_test(
        target: &std::path::Path,
    ) -> std::io::Result<std::fs::File> {
        open_project_file(target)
    }
}

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
    fs::write(&external, br#"{\"id\":\"external\"}"#)
        .expect("external fixture should be written");
    symlink(&external, &selected).expect("fixture symlink should be created");

    let opened = project_persistence::open_for_authority_test(&selected);

    assert!(
        opened.is_err(),
        "Unix project handle acquisition must not follow a selected-path symlink"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}
