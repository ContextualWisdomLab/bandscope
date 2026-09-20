#![cfg_attr(feature = "persistence_warning_gate", deny(warnings))]

//! Single-compile native integration harness for Project Persistence.
//!
//! The production persistence owner is included exactly once so integration cases can exercise its
//! crate-private capability boundary without recompiling the entire source file in every test crate.

mod project_persistence {
    include!("../src/project_persistence.rs");
}

#[path = "../src/project_load.rs"]
mod project_load;
#[path = "../src/project_root.rs"]
mod project_root;

#[path = "project_persistence_atomic_publication.case"]
mod atomic_publication;
#[path = "project_persistence_journal_path_boundary.case"]
mod journal_path_boundary;
#[path = "project_persistence_linked_ancestor.case"]
mod linked_ancestor;
#[cfg(target_os = "macos")]
#[path = "project_persistence_macos_root_alias.case"]
mod macos_root_alias;
#[path = "project_persistence_migration_content_cas.case"]
mod migration_content_cas;
#[path = "project_persistence_native_write_admission.case"]
mod native_write_admission;
#[path = "project_persistence_open_authority.case"]
mod open_authority;
#[path = "project_persistence_overwrite.case"]
mod overwrite;
#[path = "project_persistence_parent_swap.case"]
mod parent_swap;
#[path = "project_persistence_parent_symlink.case"]
mod parent_symlink;
#[path = "project_persistence_permissions.case"]
mod permissions;
#[path = "project_persistence_process_kill.case"]
mod process_kill;
#[path = "project_persistence_project_root_authority.case"]
mod project_root_authority;
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
