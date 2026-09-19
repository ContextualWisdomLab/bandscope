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

/// Return the exact canonical destination allowed for a standard macOS root alias.
#[cfg(target_os = "macos")]
fn trusted_macos_root_alias_target(path: &Path) -> Option<&'static Path> {
    match path.to_str()? {
        "/etc" => Some(Path::new("/private/etc")),
        "/tmp" => Some(Path::new("/private/tmp")),
        "/var" => Some(Path::new("/private/var")),
        _ => None,
    }
}

/// Return whether one macOS root symlink is the exact root-owned system alias BandScope permits.
#[cfg(target_os = "macos")]
fn metadata_is_trusted_macos_root_directory_alias(path: &Path, metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;

    let Some(expected_target) = trusted_macos_root_alias_target(path) else {
        return false;
    };

    metadata.file_type().is_symlink()
        && metadata.uid() == 0
        && path.parent() == Some(Path::new("/"))
        && fs::canonicalize(path).is_ok_and(|resolved| resolved == expected_target)
        && fs::symlink_metadata(expected_target)
            .is_ok_and(|target_metadata| metadata_is_safe_existing_project_directory(&target_metadata))
}

/// Keep the macOS alias exception unavailable on platforms that do not have those system aliases.
#[cfg(not(target_os = "macos"))]
fn metadata_is_trusted_macos_root_directory_alias(_path: &Path, _metadata: &fs::Metadata) -> bool {
    false
}

/// Validate every existing lexical directory component that grants project-root authority.
fn existing_project_directory_chain_is_safe(path: &Path) -> bool {
    path.ancestors()
        .filter(|ancestor| !ancestor.as_os_str().is_empty())
        .all(|ancestor| {
            fs::symlink_metadata(ancestor).is_ok_and(|metadata| {
                metadata_is_safe_existing_project_directory(&metadata)
                    || metadata_is_trusted_macos_root_directory_alias(ancestor, &metadata)
            })
        })
}

/// Resolve one already-provisioned app-local project directory without creating it.
///
/// Security Notes: `project_id` is validated before joining. The app-local base,
/// its lexical ancestor chain, and the final project directory must already exist
/// as real directories rather than symlinks or Windows reparse points. macOS keeps
/// only the root-owned `/etc`, `/tmp`, and `/var` aliases whose canonical targets
/// are the exact system `/private` directories. Rejecting linked ancestors before
/// joining prevents a stable app-local path name from redirecting reopen into a
/// different filesystem subtree. This read-side resolver never calls
/// `create_dir_all`, so a missing or replaced project root cannot be silently
/// provisioned during reopen. These checks close stable link redirection; they do
/// not claim descriptor-bound protection against an ancestor replaced after the
/// check.
pub(crate) fn resolve_existing_project_root(
    base_root: &Path,
    project_id: &str,
) -> Result<PathBuf, String> {
    if !is_valid_project_id(project_id) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    if !existing_project_directory_chain_is_safe(base_root) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    let project_root = base_root.join(project_id);
    if !existing_project_directory_chain_is_safe(&project_root) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    Ok(project_root)
}
