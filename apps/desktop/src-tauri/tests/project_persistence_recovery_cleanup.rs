#[path = "../src/project_persistence.rs"]
mod project_persistence;

#[cfg(unix)]
mod unix_recovery_cleanup {
    use super::project_persistence;
    use std::{
        fs,
        os::unix::ffi::OsStrExt,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "bandscope-project-recovery-cleanup-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    fn prepared_journal_path(target: &Path) -> PathBuf {
        target.parent().expect("fixture target should have a parent").join(format!(
            ".bandscope-recovery-{}.prepared.journal",
            project_persistence::journal_target_key(target)
                .expect("fixture target key should be derivable")
        ))
    }

    #[test]
    fn stale_prepared_journal_without_recovery_artifacts_does_not_lock_a_changed_target() {
        let root = test_dir("stale-journal");
        let target = root.join("setlist.bscope");
        let stage = root.join(format!(".bandscope-stage-{}.stage", uuid::Uuid::new_v4()));
        let original = br#"{"id":"original"}"#;
        let candidate = br#"{"id":"candidate"}"#;
        let replacement = br#"{"id":"external-replacement"}"#;
        fs::write(&target, original).expect("original fixture should be written");
        fs::write(&stage, candidate).expect("candidate fixture should be written");

        let expected = project_persistence::project_file_identity(&target)
            .expect("original identity should be capturable");
        let candidate_identity = project_persistence::project_file_identity(&stage)
            .expect("candidate identity should be capturable");
        let target_name = target.file_name().unwrap().as_bytes().to_vec();
        let stage_name = stage.file_name().unwrap().as_bytes().to_vec();
        let journal = prepared_journal_path(&target);
        let record = serde_json::json!({
            "version": 1,
            "target_name": target_name,
            "candidate_name": stage_name,
            "displaced_name": stage.file_name().unwrap().as_bytes().to_vec(),
            "expected": expected,
            "candidate": candidate_identity,
        });
        fs::write(&journal, serde_json::to_vec(&record).expect("journal should serialize"))
            .expect("prepared journal should be written");

        fs::remove_file(&stage).expect("orphan candidate should be removed");
        fs::remove_file(&target).expect("original target should be replaced externally");
        fs::write(&target, replacement).expect("external replacement should be written");

        project_persistence::recover_project_publication(&target)
            .expect("a journal with no rollback artifacts must not permanently lock the target");

        assert_eq!(fs::read(&target).expect("target should remain readable"), replacement);
        assert!(!journal.exists(), "stale recovery journal should be removed");
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn failed_journal_creation_removes_the_owned_candidate_stage() {
        let root = test_dir("journal-collision");
        let target = root.join("setlist.bscope");
        let known_good = br#"{"id":"known-good"}"#;
        fs::write(&target, known_good).expect("known-good fixture should be written");
        let journal = prepared_journal_path(&target);
        fs::write(&journal, b"occupied").expect("fixture should reserve the journal name");

        project_persistence::publish_new_project_file(&target, br#"{"id":"candidate"}"#)
            .expect_err("an occupied prepared journal should fail closed");

        let leaked_stage = fs::read_dir(&root)
            .expect("fixture directory should be readable")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name())
            .any(|name| {
                let name = name.to_string_lossy();
                name.starts_with(".bandscope-stage-") && name.ends_with(".stage")
            });
        assert!(!leaked_stage, "failed journal preparation must clean the owned stage");
        assert_eq!(fs::read(&target).expect("known-good target should remain readable"), known_good);
        fs::remove_dir_all(root).expect("test directory should be removable");
    }
}

#[cfg(windows)]
mod windows_recovery_cleanup {
    use super::project_persistence;
    use std::{
        fs,
        os::windows::ffi::OsStrExt,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "bandscope-project-recovery-cleanup-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    fn prepared_journal_path(target: &Path) -> PathBuf {
        target.parent().expect("fixture target should have a parent").join(format!(
            ".bandscope-recovery-{}.prepared.journal",
            project_persistence::journal_target_key(target)
                .expect("fixture target key should be derivable")
        ))
    }

    fn journal_name(path: &Path) -> Vec<u16> {
        path.file_name()
            .expect("fixture path should have a file name")
            .encode_wide()
            .collect()
    }

    #[test]
    fn stale_prepared_journal_without_recovery_artifacts_does_not_lock_a_changed_target() {
        let root = test_dir("windows-stale-journal");
        let target = root.join("setlist.bscope");
        let stage = root.join(format!(".bandscope-stage-{}.stage", uuid::Uuid::new_v4()));
        let original = br#"{"id":"original"}"#;
        let candidate = br#"{"id":"candidate"}"#;
        let replacement = br#"{"id":"external-replacement"}"#;
        fs::write(&target, original).expect("original fixture should be written");
        fs::write(&stage, candidate).expect("candidate fixture should be written");

        let expected = project_persistence::project_file_identity(&target)
            .expect("original identity should be capturable");
        let candidate_identity = project_persistence::project_file_identity(&stage)
            .expect("candidate identity should be capturable");
        let journal = prepared_journal_path(&target);
        let record = serde_json::json!({
            "version": 1,
            "target_name": journal_name(&target),
            "candidate_name": journal_name(&stage),
            "displaced_name": journal_name(&stage),
            "expected": expected,
            "candidate": candidate_identity,
        });
        fs::write(&journal, serde_json::to_vec(&record).expect("journal should serialize"))
            .expect("prepared journal should be written");

        fs::remove_file(&stage).expect("orphan candidate should be removed");
        fs::remove_file(&target).expect("original target should be replaced externally");
        fs::write(&target, replacement).expect("external replacement should be written");

        project_persistence::recover_project_publication(&target)
            .expect("a journal with no rollback artifacts must not permanently lock the target");

        assert_eq!(fs::read(&target).expect("target should remain readable"), replacement);
        assert!(!journal.exists(), "stale recovery journal should be removed");
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn failed_journal_creation_removes_the_owned_candidate_stage() {
        let root = test_dir("windows-journal-collision");
        let target = root.join("setlist.bscope");
        let known_good = br#"{"id":"known-good"}"#;
        fs::write(&target, known_good).expect("known-good fixture should be written");
        let journal = prepared_journal_path(&target);
        fs::write(&journal, b"occupied").expect("fixture should reserve the journal name");

        project_persistence::publish_new_project_file(&target, br#"{"id":"candidate"}"#)
            .expect_err("an occupied prepared journal should fail closed");

        let leaked_stage = fs::read_dir(&root)
            .expect("fixture directory should be readable")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name())
            .any(|name| {
                let name = name.to_string_lossy();
                name.starts_with(".bandscope-stage-") && name.ends_with(".stage")
            });
        assert!(!leaked_stage, "failed journal preparation must clean the owned stage");
        assert_eq!(fs::read(&target).expect("known-good target should remain readable"), known_good);
        fs::remove_dir_all(root).expect("test directory should be removable");
    }
}
