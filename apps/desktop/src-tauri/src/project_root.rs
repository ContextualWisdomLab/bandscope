use bandscope_desktop_core::is_valid_project_id;
use std::{
    fs,
    io::ErrorKind,
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

fn metadata_is_safe_project_directory_component(path: &Path, metadata: &fs::Metadata) -> bool {
    metadata_is_safe_existing_project_directory(metadata)
        || metadata_is_trusted_macos_root_directory_alias(path, metadata)
}

/// Validate every existing lexical directory component that grants project-root authority.
fn existing_project_directory_chain_is_safe(path: &Path) -> bool {
    path.ancestors()
        .filter(|ancestor| !ancestor.as_os_str().is_empty())
        .all(|ancestor| {
            fs::symlink_metadata(ancestor).is_ok_and(|metadata| {
                metadata_is_safe_project_directory_component(ancestor, &metadata)
            })
        })
}

/// Create one new app-owned Unix directory without exposing it through a permissive process umask.
#[cfg(unix)]
fn create_owned_directory(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;

    let mut builder = fs::DirBuilder::new();
    builder.mode(0o700).create(path)
}

/// Preserve native ACL inheritance on non-Unix platforms.
#[cfg(not(unix))]
fn create_owned_directory(path: &Path) -> std::io::Result<()> {
    fs::create_dir(path)
}

/// Create missing app-owned directory components one at a time without following a stable link.
///
/// Security Notes: unlike `create_dir_all`, each already-existing lexical component is inspected
/// with `symlink_metadata` before a child component is created. A newly created component is
/// inspected again immediately and must be a real directory. Unix creation requests mode `0700`,
/// so an inherited permissive process umask cannot broaden a new BandScope-owned directory; an
/// existing directory keeps its deliberate mode. Windows keeps native ACL inheritance. This closes
/// stable symlink/junction redirection during provisioning while preserving the narrow root-owned
/// macOS aliases accepted by reopen. It does not claim descriptor-bound protection against an
/// ancestor replaced between the metadata check and the following filesystem operation.
fn provision_directory_chain(path: &Path) -> Result<(), String> {
    let mut ancestors: Vec<&Path> = path
        .ancestors()
        .filter(|ancestor| !ancestor.as_os_str().is_empty())
        .collect();
    ancestors.reverse();

    for ancestor in ancestors {
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                if !metadata_is_safe_project_directory_component(ancestor, &metadata) {
                    return Err(PROJECT_ROOT_ERROR.to_string());
                }
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {
                create_owned_directory(ancestor).map_err(|_| PROJECT_ROOT_ERROR.to_string())?;
                let metadata = fs::symlink_metadata(ancestor)
                    .map_err(|_| PROJECT_ROOT_ERROR.to_string())?;
                if !metadata_is_safe_project_directory_component(ancestor, &metadata) {
                    return Err(PROJECT_ROOT_ERROR.to_string());
                }
            }
            Err(_) => return Err(PROJECT_ROOT_ERROR.to_string()),
        }
    }

    Ok(())
}

/// Provision or reopen one app-owned workspace directory without following linked components.
///
/// Security Notes: cache, temp, and score workspaces are reusable across operations, so unlike a
/// newly minted project root this function permits an already-existing final directory. Every
/// lexical component must still be a real directory rather than a Unix symlink or Windows reparse
/// point, with only the narrow root-owned macOS system aliases admitted. Missing Unix components
/// are created owner-only (`0700`) and revalidated immediately; existing directory modes are not
/// rewritten. This prevents stable cache/temp/scores redirection through `create_dir_all` and
/// prevents a permissive inherited umask from making a newly created workspace group/world
/// accessible. It does not claim descriptor-bound protection against a component replaced after
/// validation or a Windows ACL policy beyond native inheritance.
pub(crate) fn ensure_owned_directory(path: &Path) -> Result<PathBuf, String> {
    provision_directory_chain(path)?;
    if !existing_project_directory_chain_is_safe(path) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }
    Ok(path.to_path_buf())
}

/// Provision one new app-local project directory without following linked ancestors.
///
/// Security Notes: `project_id` is validated before joining. Missing app-local base components are
/// created one lexical directory at a time and every existing/new component must be a real
/// directory rather than a Unix symlink or Windows reparse point. New Unix components, including
/// the final project root, request owner-only mode `0700`; existing directory modes are preserved.
/// The final project directory uses single-directory create semantics and therefore refuses to reuse
/// an already-existing target. This creation-side authority mirrors `resolve_existing_project_root`
/// instead of letting a raw `create_dir_all` follow a stable link into another filesystem subtree.
pub(crate) fn provision_new_project_root(
    base_root: &Path,
    project_id: &str,
) -> Result<PathBuf, String> {
    if !is_valid_project_id(project_id) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    provision_directory_chain(base_root)?;
    if !existing_project_directory_chain_is_safe(base_root) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    let project_root = base_root.join(project_id);
    create_owned_directory(&project_root).map_err(|_| PROJECT_ROOT_ERROR.to_string())?;
    if !existing_project_directory_chain_is_safe(&project_root) {
        return Err(PROJECT_ROOT_ERROR.to_string());
    }

    Ok(project_root)
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
