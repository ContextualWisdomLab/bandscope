#[path = "../src/project_persistence.rs"]
mod project_persistence;

use bandscope_desktop_core::prepare_project_migration;
use std::{
    fs,
    path::{Path, PathBuf},
};

fn test_root(label: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "bandscope-published-recovery-content-cas-{label}-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&root).expect("fixture directory should be created");
    root
}

fn generated_stage(root: &Path) -> PathBuf {
    root.join(format!(
        ".bandscope-stage-{}.stage",
        uuid::Uuid::new_v4()
    ))
}

fn published_journal_path(target: &Path) -> PathBuf {
    target
        .parent()
        .expect("fixture target should have a parent")
        .join(format!(
            ".bandscope-recovery-{}.published.journal",
            project_persistence::journal_target_key(target)
                .expect("fixture target key should be derivable")
        ))
}

#[cfg(unix)]
fn journal_name(path: &Path) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;

    path.file_name()
        .expect("fixture path should have a file name")
        .as_bytes()
        .to_vec()
}

#[cfg(windows)]
fn journal_name(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    path.file_name()
        .expect("fixture path should have a file name")
        .encode_wide()
        .collect()
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn published_migration_fixture(
    label: &str,
    journal_version: u8,
    include_validation: bool,
) -> (PathBuf, PathBuf, PathBuf, Vec<u8>) {
    let root = test_root(label);
    let target = root.join("setlist.bscope");
    let displaced = generated_stage(&root);
    #[cfg(unix)]
    let candidate_stage = displaced.clone();
    #[cfg(windows)]
    let candidate_stage = generated_stage(&root);
    let historical = include_str!("../../core/testdata/project-v2.json");
    let prepared = prepare_project_migration(historical)
        .expect("historical fixture should prepare a canonical migration");
    let candidate = prepared.canonical_content().as_bytes().to_vec();

    fs::write(&displaced, historical).expect("known-good predecessor should be written");
    fs::write(&target, &candidate).expect("published candidate should be written");

    let expected = project_persistence::project_file_identity(&displaced)
        .expect("predecessor identity should be capturable");
    let candidate_identity = project_persistence::project_file_identity(&target)
        .expect("candidate identity should be capturable");
    let journal = published_journal_path(&target);
    let mut record = serde_json::json!({
        "version": journal_version,
        "target_name": journal_name(&target),
        "candidate_name": journal_name(&candidate_stage),
        "displaced_name": journal_name(&displaced),
        "expected": expected,
        "candidate": candidate_identity,
    });
    if include_validation {
        record["validation"] = serde_json::json!({
            "kind": "migration",
            "receipt": prepared.receipt(),
        });
    }
    fs::write(
        &journal,
        serde_json::to_vec(&record).expect("journal fixture should serialize"),
    )
    .expect("published journal should be written");

    (root, target, displaced, candidate)
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn published_v2_migration_journal_cleans_only_exact_receipt_bound_artifacts() {
    let (root, target, displaced, candidate) =
        published_migration_fixture("exact-v2", 2, true);
    let journal = published_journal_path(&target);

    project_persistence::recover_project_publication(&target)
        .expect("exact receipt-bound published state should finish cleanup");

    assert_eq!(
        fs::read(&target).expect("published candidate should remain readable"),
        candidate
    );
    assert!(
        !displaced.exists(),
        "validated rollback material should retire"
    );
    assert!(
        !journal.exists(),
        "validated published journal should retire"
    );
    fs::remove_dir_all(root).expect("fixture directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn published_v2_migration_journal_preserves_rollback_on_in_place_candidate_change() {
    use std::io::Write;

    let (root, target, displaced, candidate) =
        published_migration_fixture("mutated-v2", 2, true);
    let journal = published_journal_path(&target);
    let mutated = [candidate.as_slice(), b"\n"].concat();
    let mut same_file = fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(&target)
        .expect("published candidate should remain openable");
    same_file
        .write_all(&mutated)
        .expect("candidate bytes should change in place");
    same_file
        .sync_all()
        .expect("candidate mutation should be synchronized");
    drop(same_file);

    project_persistence::recover_project_publication(&target)
        .expect_err("receipt mismatch must preserve rollback evidence");

    assert_eq!(
        fs::read(&target).expect("mutated candidate should remain inspectable"),
        mutated
    );
    assert!(
        displaced.exists(),
        "known-good predecessor must remain available"
    );
    assert!(
        journal.exists(),
        "failed recovery must retain its durable journal"
    );
    fs::remove_dir_all(root).expect("fixture directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn legacy_identity_only_published_journal_fails_closed_without_deleting_known_good() {
    let (root, target, displaced, candidate) =
        published_migration_fixture("legacy-v1", 1, false);
    let journal = published_journal_path(&target);

    project_persistence::recover_project_publication(&target)
        .expect_err("identity-only published journals must not retire rollback material");

    assert_eq!(
        fs::read(&target).expect("candidate should remain inspectable"),
        candidate
    );
    assert!(
        displaced.exists(),
        "legacy rollback material must remain available"
    );
    assert!(
        journal.exists(),
        "legacy journal must remain for explicit recovery handling"
    );
    fs::remove_dir_all(root).expect("fixture directory should be removable");
}
