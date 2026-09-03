#[path = "../src/project_persistence.rs"]
mod project_persistence;

use std::{
    cell::Cell,
    fs,
    io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

fn test_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "bandscope-project-persistence-atomic-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("test directory should be created");
    path
}

fn stage_paths(root: &Path) -> Vec<PathBuf> {
    fs::read_dir(root)
        .expect("test directory should be readable")
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            let name = path.file_name()?.to_str()?;
            name.starts_with(".bandscope-stage-").then_some(path)
        })
        .collect()
}

#[test]
fn hard_link_fallback_never_reserves_the_final_path_with_an_empty_file() {
    let source = include_str!("../src/project_persistence.rs");

    assert!(
        !source.contains("File::create_new(target)")
            && !source.contains("File::create_new(&target)"),
        "hard-link fallback must not materialize an empty final-path placeholder before the staged project is atomically published"
    );
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn hard_link_first_save_does_not_acknowledge_a_failed_parent_directory_sync() {
    let root = test_dir("hard-link-dir-sync-failure");
    let target = root.join("setlist.bscope");
    let content = br#"{"id":"durable-candidate"}"#;
    let sync_observed_published_target = Cell::new(false);

    let error = project_persistence::publish_new_project_file_with_linker_and_directory_sync(
        &target,
        content,
        |source, destination| fs::hard_link(source, destination),
        |parent| {
            assert_eq!(parent, root.as_path());
            sync_observed_published_target.set(
                fs::read(&target).is_ok_and(|published| published == content),
            );
            Err(io::Error::new(
                io::ErrorKind::Other,
                "injected parent-directory sync failure",
            ))
        },
    )
    .expect_err("first-save success must wait for parent-directory durability");

    assert_eq!(error, "Could not publish the project safely.");
    assert!(sync_observed_published_target.get());
    assert_eq!(
        fs::read(&target).expect("the fully published target must not be deleted on sync failure"),
        content
    );
    assert_eq!(
        stage_paths(&root).len(),
        1,
        "hard-link publication must not acknowledge staging cleanup before directory durability"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn no_replace_rename_first_save_does_not_acknowledge_a_failed_parent_directory_sync() {
    let root = test_dir("rename-dir-sync-failure");
    let target = root.join("setlist.bscope");
    let content = br#"{"id":"rename-candidate"}"#;
    let sync_observed_published_target = Cell::new(false);

    let error = project_persistence::publish_new_project_file_with_linker_and_directory_sync(
        &target,
        content,
        |_source, _destination| {
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "force native no-replace rename fallback",
            ))
        },
        |parent| {
            assert_eq!(parent, root.as_path());
            sync_observed_published_target.set(
                fs::read(&target).is_ok_and(|published| published == content),
            );
            Err(io::Error::new(
                io::ErrorKind::Other,
                "injected parent-directory sync failure",
            ))
        },
    )
    .expect_err("rename publication must not report success before directory durability");

    assert_eq!(error, "Could not publish the project safely.");
    assert!(sync_observed_published_target.get());
    assert_eq!(
        fs::read(&target).expect("the complete renamed target must survive a sync failure"),
        content
    );
    assert!(
        stage_paths(&root).is_empty(),
        "native rename consumes the staged path before the durability failure is reported"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn successful_first_save_syncs_the_parent_before_hard_link_stage_cleanup() {
    let root = test_dir("dir-sync-success");
    let target = root.join("setlist.bscope");
    let content = br#"{"id":"durable-success"}"#;
    let sync_calls = Cell::new(0usize);

    project_persistence::publish_new_project_file_with_linker_and_directory_sync(
        &target,
        content,
        |source, destination| fs::hard_link(source, destination),
        |parent| {
            assert_eq!(parent, root.as_path());
            assert_eq!(
                fs::read(&target).expect("target must exist before its directory is synced"),
                content
            );
            sync_calls.set(sync_calls.get() + 1);
            Ok(())
        },
    )
    .expect("first save should succeed after the parent directory is durable");

    assert_eq!(sync_calls.get(), 1);
    assert_eq!(fs::read(&target).expect("published target should be readable"), content);
    assert!(stage_paths(&root).is_empty());
    fs::remove_dir_all(root).expect("test directory should be removable");
}
