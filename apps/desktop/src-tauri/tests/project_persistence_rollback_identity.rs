#[cfg(any(target_os = "linux", target_os = "macos", windows))]
mod project_persistence {
    include!("../src/project_persistence.rs");

    pub(crate) fn create_publication_journal_for_test(
        target: &std::path::Path,
        candidate_stage: &std::path::Path,
        displaced: &std::path::Path,
        expected: &ProjectFileIdentity,
        candidate: &ProjectFileIdentity,
    ) -> Result<std::path::PathBuf, String> {
        create_publication_journal(target, candidate_stage, displaced, expected, candidate)
    }

    pub(crate) fn finish_rolled_back_publication_for_test(
        stage: &std::path::Path,
        journal: &std::path::Path,
        target: &std::path::Path,
    ) -> Result<(), String> {
        finish_rolled_back_publication(stage, journal, target)
    }
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
mod rollback_identity {
    use super::project_persistence;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "bandscope-project-rollback-identity-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    #[test]
    fn rollback_cleanup_preserves_a_stage_that_is_no_longer_the_candidate() {
        let root = test_dir("foreign-stage");
        let target = root.join("setlist.bscope");
        let stage = root.join(format!(".bandscope-stage-{}.stage", uuid::Uuid::new_v4()));
        let original = br#"{"id":"original"}"#;
        let candidate = br#"{"id":"candidate"}"#;
        let foreign = br#"{"id":"foreign-racer"}"#;
        fs::write(&target, original).expect("original fixture should be written");
        fs::write(&stage, candidate).expect("candidate fixture should be written");

        let expected = project_persistence::project_file_identity(&target)
            .expect("original identity should be capturable");
        let candidate_identity = project_persistence::project_file_identity(&stage)
            .expect("candidate identity should be capturable");
        let journal = project_persistence::create_publication_journal_for_test(
            &target,
            &stage,
            &stage,
            &expected,
            &candidate_identity,
        )
        .expect("prepared rollback journal should be durable");

        fs::remove_file(&stage).expect("candidate pathname should be replaceable by the race fixture");
        fs::write(&stage, foreign).expect("foreign rollback artifact should be written");

        let error = project_persistence::finish_rolled_back_publication_for_test(
            &stage,
            &journal,
            &target,
        )
        .expect_err("rollback cleanup must not delete a stage whose identity no longer matches the candidate");

        assert_eq!(error, "Could not recover the project publication safely.");
        assert_eq!(
            fs::read(&stage).expect("foreign artifact must remain for recovery"),
            foreign
        );
        assert!(journal.exists(), "the journal must remain when rollback identity is ambiguous");
        assert_eq!(
            fs::read(&target).expect("target must remain untouched"),
            original
        );

        fs::remove_dir_all(root).expect("test directory should be removable");
    }
}
