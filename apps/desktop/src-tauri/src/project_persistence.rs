#[path = "../src/project_persistence_engine.rs"]
mod engine;

pub(crate) use engine::*;

use std::{
    fs::{self, File},
    io::{Cursor, Write},
    path::{Path, PathBuf},
};

const FIRST_SAVE_MAX_PROJECT_FILE_BYTES: usize = 5 * 1024 * 1024;
const FIRST_SAVE_EXISTS_ERROR: &str = "Project file already exists. Choose a new file name.";
const FIRST_SAVE_STAGE_ERROR: &str = "Could not stage the project safely.";
const FIRST_SAVE_PUBLISH_ERROR: &str = "Could not publish the project safely.";
const PROJECT_WRITE_BUSY_ERROR: &str = "Project update is already being saved.";
const PROJECT_REVISION_CONFLICT_ERROR: &str = "Project changed since it was opened.";
const PROJECT_REVISION_INVALID_ERROR: &str = "Invalid project revision.";

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
struct ProjectWriteAdmission {
    _directory: File,
}

#[cfg(unix)]
fn acquire_project_write_admission(target: &Path) -> Result<ProjectWriteAdmission, String> {
    use std::os::fd::AsRawFd;

    const LOCK_EX: i32 = 2;
    const LOCK_NB: i32 = 4;

    extern "C" {
        fn flock(fd: i32, operation: i32) -> i32;
    }

    let parent = first_save_parent(target);
    if target.file_name().is_none() || !first_save_parent_chain_is_safe(parent) {
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }
    let directory = File::open(parent).map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    let result = unsafe { flock(directory.as_raw_fd(), LOCK_EX | LOCK_NB) };
    if result == 0 {
        return Ok(ProjectWriteAdmission {
            _directory: directory,
        });
    }

    let error = std::io::Error::last_os_error();
    if error.kind() == std::io::ErrorKind::WouldBlock {
        Err(PROJECT_WRITE_BUSY_ERROR.to_string())
    } else {
        Err(FIRST_SAVE_PUBLISH_ERROR.to_string())
    }
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    #[link_name = "CreateMutexW"]
    fn create_mutex_w(
        mutex_attributes: *mut std::ffi::c_void,
        initial_owner: i32,
        name: *const u16,
    ) -> *mut std::ffi::c_void;
    #[link_name = "WaitForSingleObject"]
    fn wait_for_single_object(handle: *mut std::ffi::c_void, milliseconds: u32) -> u32;
    #[link_name = "ReleaseMutex"]
    fn release_mutex(handle: *mut std::ffi::c_void) -> i32;
    #[link_name = "CloseHandle"]
    fn close_handle(handle: *mut std::ffi::c_void) -> i32;
}

#[cfg(windows)]
struct ProjectWriteAdmission {
    handle: *mut std::ffi::c_void,
}

#[cfg(windows)]
impl Drop for ProjectWriteAdmission {
    fn drop(&mut self) {
        unsafe {
            let _ = release_mutex(self.handle);
            let _ = close_handle(self.handle);
        }
    }
}

#[cfg(windows)]
fn windows_project_write_admission_name(target: &Path) -> Result<Vec<u16>, String> {
    use std::os::windows::ffi::OsStrExt;

    let parent = first_save_parent(target);
    let Some(file_name) = target.file_name() else {
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    };
    if !first_save_parent_chain_is_safe(parent) {
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }
    let canonical_parent =
        fs::canonicalize(parent).map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    let canonical_target = canonical_parent.join(file_name);

    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for unit in canonical_target.as_os_str().encode_wide() {
        for byte in unit.to_le_bytes() {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }

    Ok(format!("Local\\BandScopeProjectWrite-{hash:016x}")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect())
}

#[cfg(windows)]
fn acquire_project_write_admission(target: &Path) -> Result<ProjectWriteAdmission, String> {
    const WAIT_OBJECT_0: u32 = 0x0000_0000;
    const WAIT_ABANDONED: u32 = 0x0000_0080;
    const WAIT_TIMEOUT: u32 = 0x0000_0102;

    let name = windows_project_write_admission_name(target)?;
    let handle = unsafe { create_mutex_w(std::ptr::null_mut(), 0, name.as_ptr()) };
    if handle.is_null() {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }

    match unsafe { wait_for_single_object(handle, 0) } {
        WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(ProjectWriteAdmission { handle }),
        WAIT_TIMEOUT => {
            unsafe {
                let _ = close_handle(handle);
            }
            Err(PROJECT_WRITE_BUSY_ERROR.to_string())
        }
        _ => {
            unsafe {
                let _ = close_handle(handle);
            }
            Err(FIRST_SAVE_PUBLISH_ERROR.to_string())
        }
    }
}

#[cfg(not(any(unix, windows)))]
struct ProjectWriteAdmission;

#[cfg(not(any(unix, windows)))]
fn acquire_project_write_admission(_target: &Path) -> Result<ProjectWriteAdmission, String> {
    Err(FIRST_SAVE_PUBLISH_ERROR.to_string())
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

fn project_revision_is_valid(revision: &str) -> bool {
    revision.len() == 64
        && revision
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn current_project_content_sha256(target: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(target) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(FIRST_SAVE_PUBLISH_ERROR.to_string()),
        Ok(_) => {}
    }

    let file = engine::open_project_file(target)
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    if !metadata.is_file() || metadata.len() > FIRST_SAVE_MAX_PROJECT_FILE_BYTES as u64 {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    let identity = first_save_identity_from_file(&file)
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    if !first_save_path_matches_identity(target, &identity) {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    let digest = bandscope_desktop_core::sha256_hex_reader(file)
        .map_err(|_| FIRST_SAVE_PUBLISH_ERROR.to_string())?;
    if !first_save_path_matches_identity(target, &identity) {
        return Err(FIRST_SAVE_PUBLISH_ERROR.to_string());
    }
    Ok(Some(digest))
}

fn verify_expected_project_revision(
    target: &Path,
    expected_content_sha256: Option<&str>,
    next_content_sha256: &str,
) -> Result<bool, String> {
    if expected_content_sha256.is_some_and(|revision| !project_revision_is_valid(revision)) {
        return Err(PROJECT_REVISION_INVALID_ERROR.to_string());
    }

    let current = current_project_content_sha256(target)?;
    match (current.as_deref(), expected_content_sha256) {
        (None, None) => Ok(false),
        (Some(current), None) if current == next_content_sha256 => Ok(true),
        (Some(current), Some(expected)) if current == expected => Ok(false),
        _ => Err(PROJECT_REVISION_CONFLICT_ERROR.to_string()),
    }
}

fn publish_project_file_after_admission<F, S>(
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

/// Executes the single first-save publication state machine with injectable native boundaries.
///
/// Production passes the real hard-link and parent-durability operations. Native persistence tests
/// replace only those two boundaries to exercise failure ordering while preserving the identical
/// staging, identity, no-clobber, permission, replacement, cleanup, durability, and native
/// cross-process admission implementation.
pub(crate) fn publish_new_project_file_with_linker_and_directory_sync<F, S>(
    target: &Path,
    content: &[u8],
    link: F,
    sync_parent: S,
) -> Result<(), String>
where
    F: FnOnce(&Path, &Path) -> std::io::Result<()>,
    S: FnMut(&Path) -> std::io::Result<()>,
{
    let _write_admission = acquire_project_write_admission(target)?;
    publish_project_file_after_admission(target, content, link, sync_parent)
}

/// Persist one app-owned workspace snapshot only when its base revision is still durable.
///
/// Security Notes: an expected revision is a path-free SHA-256 receipt from the prior accepted
/// workspace publication. After restart, an absent receipt may bind only when the canonical
/// candidate bytes exactly match the existing app-owned workspace bytes under the same native
/// admission lease; that equality path returns without staging or replacing the target. Recovery,
/// revision validation, and replacement otherwise execute under one process-external Project
/// Persistence admission lease. Malformed or stale receipts and non-identical restart candidates
/// fail closed, and stale full snapshots are never replayed automatically.
pub(crate) fn publish_workspace_project_file_with_expected_content(
    target: &Path,
    content: &[u8],
    expected_content_sha256: Option<&str>,
) -> Result<String, String> {
    if content.is_empty() {
        return Err(FIRST_SAVE_STAGE_ERROR.to_string());
    }
    if content.len() > FIRST_SAVE_MAX_PROJECT_FILE_BYTES {
        return Err("Project file is too large (exceeds 5 MiB limit)".to_string());
    }

    let next_revision = bandscope_desktop_core::sha256_hex_reader(Cursor::new(content))
        .map_err(|_| FIRST_SAVE_STAGE_ERROR.to_string())?;
    let _write_admission = acquire_project_write_admission(target)?;
    engine::recover_project_publication(target)?;
    let already_current = verify_expected_project_revision(
        target,
        expected_content_sha256,
        &next_revision,
    )?;
    if already_current {
        return Ok(next_revision);
    }
    publish_project_file_after_admission(
        target,
        content,
        |source, destination| fs::hard_link(source, destination),
        first_save_sync_parent,
    )?;
    Ok(next_revision)
}

pub(crate) fn publish_new_project_file(target: &Path, content: &[u8]) -> Result<(), String> {
    publish_new_project_file_with_linker_and_directory_sync(
        target,
        content,
        |source, destination| fs::hard_link(source, destination),
        first_save_sync_parent,
    )
}
