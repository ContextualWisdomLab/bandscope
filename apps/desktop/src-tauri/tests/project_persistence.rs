//! Single-compile native integration harness for Project Persistence.
//!
//! The production persistence owner is included exactly once so integration cases can exercise its
//! crate-private capability boundary without recompiling the entire source file in every test crate.

mod project_persistence {
    include!("../src/project_persistence.rs");

    #[cfg(any(target_os = "linux", target_os = "macos", windows))]
    pub(crate) fn create_publication_journal_for_test(
        target: &std::path::Path,
        candidate_stage: &std::path::Path,
        displaced: &std::path::Path,
        expected: &ProjectFileIdentity,
        candidate: &ProjectFileIdentity,
    ) -> Result<std::path::PathBuf, String> {
        create_publication_journal(
            target,
            candidate_stage,
            displaced,
            expected,
            candidate,
            PublicationValidation::IdentityOnly,
        )
    }

    #[cfg(any(target_os = "linux", target_os = "macos", windows))]
    pub(crate) fn finish_rolled_back_publication_for_test(
        stage: &std::path::Path,
        journal: &std::path::Path,
        target: &std::path::Path,
    ) -> Result<(), String> {
        finish_rolled_back_publication(stage, journal, target)
    }
}

#[path = "../src/project_load.rs"]
mod project_load;
#[path = "../src/project_root.rs"]
mod project_root;

#[path = "project_persistence_atomic_publication.case"]
mod atomic_publication;
#[path = "project_persistence_linked_ancestor.case"]
mod linked_ancestor;
#[cfg(target_os = "macos")]
#[path = "project_persistence_macos_root_alias.case"]
mod macos_root_alias;
#[path = "project_persistence_migration_content_cas.case"]
mod migration_content_cas;
#[path = "project_persistence_open_authority.case"]
mod open_authority;
#[path = "project_persistence_overwrite.case"]
mod overwrite;
#[path = "project_persistence_parent_symlink.case"]
mod parent_symlink;
#[path = "project_persistence_permissions.case"]
mod permissions;
#[path = "project_persistence_published_recovery_content_cas.case"]
mod published_recovery_content_cas;
#[path = "project_persistence_read_identity.case"]
mod read_identity;
#[path = "project_persistence_recovery_cleanup.case"]
mod recovery_cleanup;
#[path = "project_persistence_rollback_identity.case"]
mod rollback_identity;
#[cfg(windows)]
#[path = "project_persistence_windows_identity.case"]
mod windows_identity;
