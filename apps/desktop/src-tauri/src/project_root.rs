use bandscope_desktop_core::is_valid_project_id;
use std::{
    fs,
    path::{Path, PathBuf},
};

const PROJECT_ROOT_ERROR: &str = "Could not prepare the local project workspace.";

#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

/// Return whether an existing Windows project directory is a real directory, not a reparse point.
#[cfg(windows)]
fn metadata_is_safe_existing_project_directory(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    metadata.is_dir() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

/// Return whether an existing non-Windows project directory is a real directory, not a symlink.
#[cfg(not(windows))]
fn metadata_is_safe_existing_project_directory(metadata: &fs::Metadata) -> bool {
    metadata.is_dir() && !metadata.file_type().is_symlink()
}

/// Resolve one already-provisioned app-local project directory without creating it.
///
/// Security Notes: `project_id` is validated before joining. The app-local base
/// itself and the final project directory must already exist as real directories
/// rather than symlinks or Windows reparse points. Rejecting a linked base before
/// joining prevents a stable app-local path name from redirecting reopen into a
/// different filesystem subtree. This read-side resolver never calls
/// `create_dir_all`, so a missing or replaced project root cannot be silently
/// provisioned during reopen. Descriptor-bound authority for every ancestor and
/// concurrent parent replacement remains a separate platform-hardening
/// requirement.
pub(crate) fn resolve_existing_project_root(
    base_root: &Path,
    project_id: &str,
) -> Result<PathBuf, String> {
    if !is_valid_project_id(project_id) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    let base_metadata =
        fs::symlink_metadata(base_root).map_err(|_| PROJECT_ROOT_ERROR.to_string())?;
    if !metadata_is_safe_existing_project_directory(&base_metadata) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    let project_root = base_root.join(project_id);
    let metadata = fs::symlink_metadata(&project_root)
        .map_err(|_| PROJECT_ROOT_ERROR.to_string())?;
    if !metadata_is_safe_existing_project_directory(&metadata) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    Ok(project_root)
}
