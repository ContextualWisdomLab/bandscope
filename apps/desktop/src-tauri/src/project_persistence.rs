#[path = "../src/project_persistence_engine.rs"]
mod engine;

pub(crate) use engine::*;

use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

const FIRST_SAVE_MAX_PROJECT_FILE_BYTES: usize = 5 * 1024 * 1024;
const FIRST_SAVE_EXISTS_ERROR: &str = "Project file already exists. Choose a new file name.";
const FIRST_SAVE_STAGE_ERROR: &str = "Could not stage the project safely.";
const FIRST_SAVE_PUBLISH_ERROR: &str = "Could not publish the project safely.";
const RECOVERY_AMBIGUITY_ERROR: &str = "Could not recover the project publication safely.";
const RECOVERY_JOURNAL_PROBE_MAX_BYTES: usize = 64 * 1024;

fn first_save_parent(target: &Path) -> &Path {
    match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    }
}

fn first_save_stage_path(target: &Path) -> Result<PathBuf, String> {
    if target.file_name().is_none() {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    Ok(first_save_parent(target).join(format!(
        ".bandscope-stage-{}.stage",
        uuid::Uuid::new_v4()
    )))
}

#[cfg(unix)]
fn first_save_create_private_file(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;

    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true).mode(0o600);
    options.open(path)
}

#[cfg(not(unix))]
fn first_save_create_private_file(path: &Path) -> std::io::Result<File> {
    File::create_new(path)
}

#[cfg(windows)]
fn first_save_metadata_is_safe_directory(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    metadata.is_dir() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

#[cfg(not(windows))]
fn first_save_metadata_is_safe_directory(metadata: &fs::Metadata) -> bool {
    metadata.is_dir() && !metadata.file_type().is_symlink()
}

#[cfg(target_os = "macos")]
fn first_save_is_trusted_macos_root_alias(path: &Path, metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;

    let Some(expected_target) = engine::trusted_macos_root_alias_target(path) else {
        return false;
    };
    metadata.file_type().is_symlink()
        && metadata.uid() == 0
        && path.parent() == Some(Path::new("/"))
        && fs::canonicalize(path).is_ok_and(|resolved| resolved == expected_target)
        && fs::symlink_metadata(expected_target)
            .is_ok_and(|target| first_save_metadata_is_safe_directory(&target))
}

#[cfg(not(target_os = "macos"))]
fn first_save_is_trusted_macos_root_alias(_path: &Path, _metadata: &fs::Metadata) -> bool {
    false
}

fn first_save_parent_chain_is_safe(parent: &Path) -> bool {
    parent
        .ancestors()
        .filter(|ancestor| !ancestor.as_os_str().is_empty())
        .all(|ancestor| {
            fs::symlink_metadata(ancestor).is_ok_and(|metadata| {
                first_save_metadata_is_safe_directory(&metadata)
                    || first_save_is_trusted_macos_root_alias(ancestor, &metadata)
            })
        })
}

#[cfg(unix)]
#[derive(Clone, Debug, Eq, PartialEq)]
struct FirstSaveIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn first_save_identity_from_file(file: &File) -> std::io::Result<FirstSaveIdentity> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    Ok(FirstSaveIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(unix)]
fn first_save_path_matches_identity(path: &Path, expected: &FirstSaveIdentity) -> bool {
    use std::os::unix::fs::MetadataExt;

    fs::symlink_metadata(path).is_ok_and(|metadata| {
        metadata.is_file()
            && !metadata.file_type().is_symlink()
            && metadata.dev() == expected.device
            && metadata.ino() == expected.inode
    })
}

#[cfg(windows)]
type FirstSaveIdentity = engine::WindowsFileIdentity;

#[cfg(windows)]
fn first_save_identity_from_file(file: &File) -> std::io::Result<FirstSaveIdentity> {
    engine::windows_file_identity(file)
}

#[cfg(windows)]
fn first_save_path_matches_identity(path: &Path, expected: &FirstSaveIdentity) -> bool {
    engine::project_file_identity(path).is_ok_and(|identity| &identity == expected)
}

#[cfg(not(any(unix, windows)))]
#[derive(Clone, Debug, Eq, PartialEq)]
struct FirstSaveIdentity;

#[cfg(not(any(unix, windows)))]
fn first_save_identity_from_file(_file: &File) -> std::io::Result<FirstSaveIdentity> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "first-save identity is unsupported on this platform",
    ))
}

#[cfg(not(any(unix, windows)))]
fn first_save_path_matches_identity(_path: &Path, _expected: &FirstSaveIdentity) -> bool {
    false
}

fn first_save_stage_is_current(
    parent: &Path,
    stage: &Path,
    expected: &FirstSaveIdentity,
) -> bool {
    first_save_parent_chain_is_safe(parent) && first_save_path_matches_identity(stage, expected)
}

fn first_save_target_is_current(
    parent: &Path,
    target: &Path,
    expected: &FirstSaveIdentity,
) -> bool {
    first_save_parent_chain_is_safe(parent) && first_save_path_matches_identity(target, expected)
}

fn first_save_remove_owned_stage(
    parent: &Path,
    stage: &Path,
    expected: &FirstSaveIdentity,
    required: bool,
) -> Result<(), String> {
    if !first_save_parent_chain_is_safe(parent) {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    match fs::symlink_metadata(stage) {
        Ok(_) if first_save_path_matches_identity(stage, expected) => {
            fs::remove_file(stage).map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())
        }
        Err(error) if !required && error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(FIRST_SAVE_PUBLISH_ERROR.to_string()),
    }
}

#[cfg(unix)]
fn first_save_sync_parent(parent: &Path) -> std::io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(windows)]
fn first_save_sync_parent(_parent: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn first_save_sync_parent(_parent: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "first-save directory durability is unsupported on this platform",
    ))
}

#[cfg(windows)]
fn first_save_flush_target(
    target: &Path,
    expected: &FirstSaveIdentity,
) -> Result<(), String> {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    if !first_save_path_matches_identity(target, expected) {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    let mut options = fs::OpenOptions::new();
    options
        .read(true)
        .write(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options
        .open(target)
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    let identity = engine::windows_file_identity(&file)
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    if &identity != expected {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    file.sync_all()
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())
}

#[cfg(not(windows))]
fn first_save_flush_target(
    _target: &Path,
    _expected: &FirstSaveIdentity,
) -> Result<(), String> {
    Ok(())
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[cfg(unix)]
type RecoveryJournalPathName = Vec<u8>;

#[cfg(windows)]
type RecoveryJournalPathName = Vec<u16>;

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[derive(serde::Deserialize)]
struct RecoveryAuthorityProbe {
    version: u8,
    candidate_name: RecoveryJournalPathName,
    displaced_name: RecoveryJournalPathName,
    expected: engine::ProjectFileIdentity,
    candidate: engine::ProjectFileIdentity,
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn recovery_path_from_name(parent: &Path, name: &RecoveryJournalPathName) -> Option<PathBuf> {
    #[cfg(unix)]
    let relative = {
        use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
        PathBuf::from(OsStr::from_bytes(name))
    };
    #[cfg(windows)]
    let relative = {
        use std::{ffi::OsString, os::windows::ffi::OsStringExt};
        PathBuf::from(OsString::from_wide(name))
    };

    let mut components = relative.components();
    match (components.next(), components.next()) {
        (Some(std::path::Component::Normal(_)), None) => Some(parent.join(relative)),
        _ => None,
    }
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn prepared_recovery_target_is_ambiguous(target: &Path) -> Result<bool, String> {
    let parent = first_save_parent(target);
    let prepared = parent.join(format!(
        ".bandscope-recovery-{}.prepared.journal",
        engine::journal_target_key(target).map_err(|_| RECOVERY_AMBIGUITY_ERROR.to_string())?
    ));
    match fs::symlink_metadata(&prepared) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err(RECOVERY_AMBIGUITY_ERROR.to_string()),
        Ok(_) => {}
    }

    let snapshot = engine::read_project_file_with_identity(&prepared)
        .map_err(|_| RECOVERY_AMBIGUITY_ERROR.to_string())?;
    if snapshot.content().len() > RECOVERY_JOURNAL_PROBE_MAX_BYTES {
        return Err(RECOVERY_AMBIGUITY_ERROR.to_string());
    }
    let probe: RecoveryAuthorityProbe = serde_json::from_str(snapshot.content())
        .map_err(|_| RECOVERY_AMBIGUITY_ERROR.to_string())?;
    if probe.version != 2 {
        return Ok(false);
    }
    let Some(candidate_path) = recovery_path_from_name(parent, &probe.candidate_name) else {
        return Ok(false);
    };
    let Some(displaced_path) = recovery_path_from_name(parent, &probe.displaced_name) else {
        return Ok(false);
    };
    let Ok(target_identity) = engine::project_file_identity(target) else {
        return Ok(false);
    };
    if target_identity == probe.expected || target_identity == probe.candidate {
        return Ok(false);
    }
    let candidate_is_preserved = engine::project_file_identity(&candidate_path)
        .is_ok_and(|identity| identity == probe.candidate);
    if !candidate_is_preserved {
        return Ok(false);
    }
    let rollback_artifact_consumed = displaced_path == candidate_path
        || matches!(fs::symlink_metadata(&displaced_path), Err(error) if error.kind() == std::io::ErrorKind::NotFound);
    Ok(rollback_artifact_consumed)
}

/// Repairs one target-scoped publication journal without treating an unrecorded third target
/// identity as proof that rollback completed. A concurrent occupant restored by the live writer is
/// safe to keep, but after a crash the v2 journal does not persist that occupant's native identity;
/// candidate and journal evidence therefore remain until recovery authority is unambiguous.
pub(crate) fn recover_project_publication(target: &Path) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "macos", windows))]
    if prepared_recovery_target_is_ambiguous(target)? {
        return Err(RECOVERY_AMBIGUITY_ERROR.to_string());
    }
    engine::recover_project_publication(target)
}

/// Executes the single first-save publication state machine with injectable native boundaries.
///
/// Production passes the real hard-link and parent-durability operations. Native persistence tests
/// replace only those two boundaries to exercise failure ordering while preserving the identical
/// staging, identity, no-clobber, permission, replacement, cleanup, and durability implementation.
pub(crate) fn publish_new_project_file_with_linker_and_directory_sync<F, S>(
    target: &Path,
    content: &[u8],
    link: F,
    mut sync_parent: S,
) -> Result<(), String>
where
    F: FnOnce(&Path, &Path) -> std::io::Result<()>,
    S: FnMut(&Path) -> std::io::Result<()>,
{
    if content.is_empty() {
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }
    if content.len() > FIRST_SAVE_MAX_PROJECT_FILE_BYTES {
        return Err("Project file is too large (exceeds 5 MiB limit)".to_string());
    }

    let parent = first_save_parent(target);
    if target.file_name().is_none() || !first_save_parent_chain_is_safe(parent) {
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }

    let expected_target = match fs::symlink_metadata(target) {
        Ok(metadata) => {
            let identity = engine::project_file_identity(target)?;
            Some((identity, metadata.permissions()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err(FIRST_SAVE_PUBLISH_ERROR.to_string()),
    };

    let stage = first_save_stage_path(target)?;
    let mut staged =
        first_save_create_private_file(&stage).map_err(|_| FIRST_SAVE_STAGE_ERROR.to_string())?;
    let staged_identity = first_save_identity_from_file(&staged)
        .map_err(|_| FIRST_SAVE_STAGE_ERROR.to_string())?;
    if staged.write_all(content).is_err() {
        drop(staged);
        let _ = first_save_remove_owned_stage(parent, &stage, &staged_identity, true);
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }
    #[cfg(unix)]
    if let Some((_, permissions)) = expected_target.as_ref() {
        use std::os::unix::fs::PermissionsExt;

        let data_permissions = fs::Permissions::from_mode(permissions.mode() & 0o666);
        if staged.set_permissions(data_permissions).is_err() {
            drop(staged);
            let _ = first_save_remove_owned_stage(parent, &stage, &staged_identity, true);
            return Err(FIRST_SAVE_STAGE_ERROR.to_string());
        }
    }
    if staged.sync_all().is_err() {
        drop(staged);
        let _ = first_save_remove_owned_stage(parent, &stage, &staged_identity, true);
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }
    drop(staged);

    if !first_save_stage_is_current(parent, &stage, &staged_identity) {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }

    if let Some((expected, _)) = expected_target {
        return engine::replace_existing_project_file(&stage, target, &expected);
    }

    let link_result = link(&stage, target);
    if !first_save_stage_is_current(parent, &stage, &staged_identity) {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }

    match link_result {
        Ok(()) => {
            if !first_save_target_is_current(parent, target, &staged_identity) {
                return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
            }
            first_save_remove_owned_stage(parent, &stage, &staged_identity, true)?;
            if !first_save_target_is_current(parent, target, &staged_identity) {
                return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
            }
            sync_parent(parent).map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
            if !first_save_target_is_current(parent, target, &staged_identity) {
                return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
            }
            first_save_flush_target(target, &staged_identity)?;
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            first_save_remove_owned_stage(parent, &stage, &staged_identity, true)?;
            Err(FIRST_SAVE_EXISTS_ERROR.to_string())
        }
        Err(_) => match engine::publish_synced_file_noreplace_with_directory_sync(
            &stage,
            target,
            &mut sync_parent,
        ) {
            Ok(()) => {
                if !first_save_target_is_current(parent, target, &staged_identity) {
                    return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
                }
                first_save_flush_target(target, &staged_identity)?;
                Ok(())
            }
            Err(error) => {
                first_save_remove_owned_stage(parent, &stage, &staged_identity, false)?;
                Err(error)
            }
        },
    }
}

pub(crate) fn publish_new_project_file(target: &Path, content: &[u8]) -> Result<(), String> {
    publish_new_project_file_with_linker_and_directory_sync(
        target,
        content,
        |source, destination| fs::hard_link(source, destination),
        first_save_sync_parent,
    )
}
