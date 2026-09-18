use crate::project_persistence;
use bandscope_desktop_core::{prepare_project_migration, ProjectDocumentPayload};
use std::path::{Path, PathBuf};

const PROJECT_PUBLISH_ERROR: &str = "Could not publish the project safely.";

fn migration_stage_path(target: &Path) -> Result<PathBuf, String> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    if target.file_name().is_none() {
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }
    Ok(parent.join(format!(
        ".bandscope-stage-{}.stage",
        uuid::Uuid::new_v4()
    )))
}

fn remove_stage(path: &Path) {
    let _ = std::fs::remove_file(path);
}

#[cfg(unix)]
fn preserve_project_data_permissions(target: &Path, stage: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let target_file = project_persistence::open_project_file(target)
        .map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    let target_metadata = target_file
        .metadata()
        .map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    let stage_file = project_persistence::open_project_file(stage)
        .map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    let data_permissions = std::fs::Permissions::from_mode(target_metadata.permissions().mode() & 0o666);
    stage_file
        .set_permissions(data_permissions)
        .map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    stage_file
        .sync_all()
        .map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    Ok(())
}

#[cfg(not(unix))]
fn preserve_project_data_permissions(_target: &Path, _stage: &Path) -> Result<(), String> {
    Ok(())
}

/// Load one project and durably publish a validated historical-format migration when required.
///
/// The exact bounded bytes and native identity come from the same Project Persistence snapshot.
/// Historical inputs are prepared through the core migration authority, staged through the existing
/// crash-safe publisher, then committed only through the receipt-aware compare-and-swap replacement.
/// Current-format projects are parsed and returned without rewriting incidental byte representation.
/// A successful migration returns the already-validated prepared document instead of reparsing a
/// pathname that another process could have replaced after publication.
pub(crate) fn load_project_document(target: &Path) -> Result<ProjectDocumentPayload, String> {
    project_persistence::recover_project_publication(target)?;
    let snapshot = project_persistence::read_project_file_with_identity(target)?;
    let prepared = prepare_project_migration(snapshot.content())?;

    if prepared.receipt().migrated {
        let stage = migration_stage_path(target)?;
        project_persistence::publish_new_project_file(
            &stage,
            prepared.canonical_content().as_bytes(),
        )?;
        if let Err(error) = preserve_project_data_permissions(target, &stage) {
            remove_stage(&stage);
            return Err(error);
        }
        project_persistence::replace_existing_project_file_for_migration(
            &stage,
            target,
            snapshot.identity(),
            prepared.receipt(),
        )?;
    }

    Ok(prepared.document().clone())
}
