#[path = "../src/project_persistence.rs"]
mod project_persistence;

use bandscope_desktop_core::prepare_project_migration;
use std::{fs, io::Write};

fn test_root(label: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "bandscope-migration-content-cas-{label}-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&root).expect("fixture directory should be created");
    root
}

fn synchronized_stage(root: &std::path::Path, content: &[u8]) -> std::path::PathBuf {
    let stage = root.join(format!(
        ".bandscope-stage-{}.stage",
        uuid::Uuid::new_v4()
    ));
    let mut file = fs::File::create_new(&stage).expect("candidate stage should be created");
    file.write_all(content)
        .expect("candidate bytes should be written");
    file.sync_all().expect("candidate stage should be synchronized");
    stage
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn migration_publication_rolls_back_an_in_place_predecessor_change() {
    let root = test_root("predecessor-change");
    let target = root.join("setlist.bscope");
    let original = include_str!("../../core/testdata/project-v2.json");
    fs::write(&target, original).expect("historical fixture should be written");

    let snapshot = project_persistence::read_project_file_with_identity(&target)
        .expect("historical project should be read with native identity");
    let prepared = prepare_project_migration(snapshot.content())
        .expect("historical project should prepare a canonical migration");

    let changed_but_parse_equivalent = format!("{original}\n");
    let mut same_file = fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(&target)
        .expect("the predecessor object should remain openable");
    same_file
        .write_all(changed_but_parse_equivalent.as_bytes())
        .expect("the predecessor bytes should change in place");
    same_file
        .sync_all()
        .expect("the in-place predecessor change should be synchronized");
    drop(same_file);

    let current_identity = project_persistence::project_file_identity(&target)
        .expect("the modified predecessor should retain native identity");
    assert_eq!(&current_identity, snapshot.identity());

    let stage = synchronized_stage(&root, prepared.canonical_content().as_bytes());
    project_persistence::replace_existing_project_file_for_migration(
        &stage,
        &target,
        snapshot.identity(),
        prepared.receipt(),
    )
    .expect_err("digest mismatch must roll the migration publication back");

    assert_eq!(
        fs::read(&target).expect("the changed predecessor should remain readable"),
        changed_but_parse_equivalent.as_bytes()
    );
    assert!(!stage.exists(), "the failed candidate stage should be cleaned");
    fs::remove_dir_all(root).expect("fixture directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn migration_publication_commits_only_exact_receipt_bound_bytes() {
    let root = test_root("exact-match");
    let target = root.join("setlist.bscope");
    let original = include_str!("../../core/testdata/project-v2.json");
    fs::write(&target, original).expect("historical fixture should be written");

    let snapshot = project_persistence::read_project_file_with_identity(&target)
        .expect("historical project should be read with native identity");
    let prepared = prepare_project_migration(snapshot.content())
        .expect("historical project should prepare a canonical migration");
    let stage = synchronized_stage(&root, prepared.canonical_content().as_bytes());

    project_persistence::replace_existing_project_file_for_migration(
        &stage,
        &target,
        snapshot.identity(),
        prepared.receipt(),
    )
    .expect("exact predecessor and candidate bytes should publish");

    assert_eq!(
        fs::read(&target).expect("the migrated target should be readable"),
        prepared.canonical_content().as_bytes()
    );
    assert!(!stage.exists(), "successful publication should retire rollback material");
    fs::remove_dir_all(root).expect("fixture directory should be removable");
}
