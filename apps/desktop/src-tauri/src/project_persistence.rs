use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use serde::{Deserialize, Serialize};

const MAX_PROJECT_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_RECOVERY_JOURNAL_BYTES: usize = 64 * 1024;
const PROJECT_EXISTS_ERROR: &str = "Project file already exists. Choose a new file name.";
const PROJECT_STAGE_ERROR: &str = "Could not stage the project safely.";
const PROJECT_PUBLISH_ERROR: &str = "Could not publish the project safely.";
const PROJECT_READ_ERROR: &str = "Failed to read file";
const PROJECT_TOO_LARGE_ERROR: &str = "Project file is too large (exceeds 5MB limit)";
const PROJECT_RECOVERY_ERROR: &str = "Could not recover the project publication safely.";

#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
#[cfg(target_os = "linux")]
const UNIX_PROJECT_OPEN_FLAGS: i32 = 0x0002_0800; // O_NOFOLLOW | O_NONBLOCK
#[cfg(target_os = "macos")]
const UNIX_PROJECT_OPEN_FLAGS: i32 = 0x0000_0104; // O_NOFOLLOW | O_NONBLOCK

fn project_parent(target: &Path) -> &Path {
    match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    }
}

fn staging_path(target: &Path) -> Result<PathBuf, String> {
    let parent = project_parent(target);
    if target.file_name().is_none() {
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }
    let stage_name = format!(".bandscope-stage-{}.stage", uuid::Uuid::new_v4());
    Ok(parent.join(stage_name))
}

fn remove_stage(path: &Path) {
    let _ = fs::remove_file(path);
}

#[cfg(target_os = "linux")]
fn rename_noreplace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};

    const AT_FDCWD: i32 = -100;
    const RENAME_NOREPLACE: u32 = 1;

    extern "C" {
        fn renameat2(
            olddirfd: i32,
            oldpath: *const std::os::raw::c_char,
            newdirfd: i32,
            newpath: *const std::os::raw::c_char,
            flags: u32,
        ) -> i32;
    }

    let source = CString::new(source.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project staging path contains NUL",
        )
    })?;
    let destination = CString::new(destination.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project destination path contains NUL",
        )
    })?;

    let result = unsafe {
        renameat2(
            AT_FDCWD,
            source.as_ptr(),
            AT_FDCWD,
            destination.as_ptr(),
            RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn rename_noreplace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};

    const RENAME_EXCL: u32 = 0x0000_0004;

    extern "C" {
        fn renamex_np(
            from: *const std::os::raw::c_char,
            to: *const std::os::raw::c_char,
            flags: u32,
        ) -> i32;
    }

    let source = CString::new(source.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project staging path contains NUL",
        )
    })?;
    let destination = CString::new(destination.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project destination path contains NUL",
        )
    })?;

    let result = unsafe { renamex_np(source.as_ptr(), destination.as_ptr(), RENAME_EXCL) };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(windows)]
fn rename_noreplace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_WRITE_THROUGH: u32 = 0x0000_0008;

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "MoveFileExW"]
        fn move_file_ex_w(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    let result = unsafe {
        move_file_ex_w(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    };
    if result != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn rename_noreplace(_source: &Path, _destination: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "atomic no-replace project publication is unsupported on this platform",
    ))
}

#[cfg(target_os = "linux")]
fn rename_exchange(left: &Path, right: &Path) -> std::io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};

    const AT_FDCWD: i32 = -100;
    const RENAME_EXCHANGE: u32 = 2;

    extern "C" {
        fn renameat2(
            olddirfd: i32,
            oldpath: *const std::os::raw::c_char,
            newdirfd: i32,
            newpath: *const std::os::raw::c_char,
            flags: u32,
        ) -> i32;
    }

    let left = CString::new(left.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project exchange path contains NUL",
        )
    })?;
    let right = CString::new(right.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project exchange path contains NUL",
        )
    })?;

    let result = unsafe {
        renameat2(
            AT_FDCWD,
            left.as_ptr(),
            AT_FDCWD,
            right.as_ptr(),
            RENAME_EXCHANGE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn rename_exchange(left: &Path, right: &Path) -> std::io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};

    const RENAME_SWAP: u32 = 0x0000_0002;

    extern "C" {
        fn renamex_np(
            from: *const std::os::raw::c_char,
            to: *const std::os::raw::c_char,
            flags: u32,
        ) -> i32;
    }

    let left = CString::new(left.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project exchange path contains NUL",
        )
    })?;
    let right = CString::new(right.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project exchange path contains NUL",
        )
    })?;

    let result = unsafe { renamex_np(left.as_ptr(), right.as_ptr(), RENAME_SWAP) };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(windows)]
fn replace_file_with_backup(
    replaced: &Path,
    replacement: &Path,
    backup: &Path,
) -> std::io::Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "ReplaceFileW"]
        fn replace_file_w(
            replaced_file_name: *const u16,
            replacement_file_name: *const u16,
            backup_file_name: *const u16,
            replace_flags: u32,
            exclude: *mut std::ffi::c_void,
            reserved: *mut std::ffi::c_void,
        ) -> i32;
    }

    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>()
    };
    let replaced = wide(replaced);
    let replacement = wide(replacement);
    let backup = wide(backup);

    let result = unsafe {
        replace_file_w(
            replaced.as_ptr(),
            replacement.as_ptr(),
            backup.as_ptr(),
            0,
            ptr::null_mut(),
            ptr::null_mut(),
        )
    };
    if result != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(windows)]
pub(crate) fn open_project_file(target: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;

    let mut options = fs::OpenOptions::new();
    options
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    options.open(target)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub(crate) fn open_project_file(target: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;

    let mut options = fs::OpenOptions::new();
    options.read(true).custom_flags(UNIX_PROJECT_OPEN_FLAGS);
    options.open(target)
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
pub(crate) fn open_project_file(_target: &Path) -> std::io::Result<File> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "project loading requires no-follow handle acquisition on this platform",
    ))
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn open_project_file(_target: &Path) -> std::io::Result<File> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "project loading is unsupported on this platform",
    ))
}

#[cfg(unix)]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;

    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(windows)]
#[repr(C)]
struct WindowsFileTime {
    low_date_time: u32,
    high_date_time: u32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowsByHandleFileInformation {
    file_attributes: u32,
    creation_time: WindowsFileTime,
    last_access_time: WindowsFileTime,
    last_write_time: WindowsFileTime,
    volume_serial_number: u32,
    file_size_high: u32,
    file_size_low: u32,
    number_of_links: u32,
    file_index_high: u32,
    file_index_low: u32,
}

#[cfg(windows)]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub(crate) struct WindowsFileIdentity {
    volume_serial_number: u32,
    file_index: u64,
}

#[cfg(windows)]
pub(crate) fn windows_file_identity(file: &File) -> std::io::Result<WindowsFileIdentity> {
    use std::{mem::MaybeUninit, os::windows::io::AsRawHandle};

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "GetFileInformationByHandle"]
        fn get_file_information_by_handle(
            file: std::os::windows::io::RawHandle,
            information: *mut WindowsByHandleFileInformation,
        ) -> i32;
    }

    let mut information = MaybeUninit::<WindowsByHandleFileInformation>::uninit();
    let result = unsafe {
        get_file_information_by_handle(file.as_raw_handle(), information.as_mut_ptr())
    };
    if result == 0 {
        return Err(std::io::Error::last_os_error());
    }
    let information = unsafe { information.assume_init() };
    Ok(WindowsFileIdentity {
        volume_serial_number: information.volume_serial_number,
        file_index: ((information.file_index_high as u64) << 32)
            | information.file_index_low as u64,
    })
}

#[cfg(windows)]
fn metadata_is_regular_project_file(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    metadata.is_file() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

#[cfg(not(windows))]
fn metadata_is_regular_project_file(metadata: &fs::Metadata) -> bool {
    metadata.is_file() && !metadata.file_type().is_symlink()
}

#[cfg(windows)]
fn metadata_is_safe_project_directory(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    metadata.is_dir() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

#[cfg(not(windows))]
fn metadata_is_safe_project_directory(metadata: &fs::Metadata) -> bool {
    metadata.is_dir() && !metadata.file_type().is_symlink()
}

#[cfg(unix)]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub(crate) struct ProjectFileIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn project_file_identity_from_metadata(metadata: &fs::Metadata) -> ProjectFileIdentity {
    use std::os::unix::fs::MetadataExt;

    ProjectFileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    }
}

#[cfg(unix)]
pub(crate) fn project_file_identity(target: &Path) -> Result<ProjectFileIdentity, String> {
    let metadata = fs::symlink_metadata(target).map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    if !metadata_is_regular_project_file(&metadata) {
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }
    Ok(project_file_identity_from_metadata(&metadata))
}

#[cfg(windows)]
pub(crate) type ProjectFileIdentity = WindowsFileIdentity;

#[cfg(windows)]
pub(crate) fn project_file_identity(target: &Path) -> Result<ProjectFileIdentity, String> {
    let file = open_project_file(target).map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| PROJECT_PUBLISH_ERROR.to_string())?;
    if !metadata_is_regular_project_file(&metadata) {
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }
    windows_file_identity(&file).map_err(|_| PROJECT_PUBLISH_ERROR.to_string())
}

#[cfg(not(any(unix, windows)))]
#[derive(Debug, Eq, PartialEq)]
pub(crate) struct ProjectFileIdentity;

#[cfg(not(any(unix, windows)))]
pub(crate) fn project_file_identity(_target: &Path) -> Result<ProjectFileIdentity, String> {
    Err(PROJECT_PUBLISH_ERROR.to_string())
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[cfg(unix)]
type JournalPathName = Vec<u8>;

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[cfg(windows)]
type JournalPathName = Vec<u16>;

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[derive(Debug, Deserialize, Serialize)]
struct PublicationJournal {
    version: u8,
    target_name: JournalPathName,
    stage_name: JournalPathName,
    expected: ProjectFileIdentity,
    candidate: ProjectFileIdentity,
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn journal_path_name(path: &Path) -> Result<JournalPathName, String> {
    let name = path
        .file_name()
        .ok_or_else(|| PROJECT_RECOVERY_ERROR.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        return Ok(name.as_bytes().to_vec());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        return Ok(name.encode_wide().collect());
    }
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn path_from_journal_name(parent: &Path, name: &JournalPathName) -> Option<PathBuf> {
    #[cfg(unix)]
    {
        use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
        return Some(parent.join(OsStr::from_bytes(name)));
    }
    #[cfg(windows)]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;
        return Some(parent.join(OsString::from_wide(name)));
    }
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn generated_stage_name(name: &JournalPathName) -> bool {
    let Some(path) = path_from_journal_name(Path::new("."), name) else {
        return false;
    };
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let Some(uuid) = name
        .strip_prefix(".bandscope-stage-")
        .and_then(|value| value.strip_suffix(".stage"))
    else {
        return false;
    };
    uuid::Uuid::parse_str(uuid).is_ok()
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn recovery_journal_name(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let Some(uuid) = name
        .strip_prefix(".bandscope-recovery-")
        .and_then(|value| value.strip_suffix(".journal"))
    else {
        return false;
    };
    uuid::Uuid::parse_str(uuid).is_ok()
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> std::io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(windows)]
fn sync_parent_directory(_parent: &Path) -> std::io::Result<()> {
    // Windows ReplaceFileW/MoveFileExW provide the native write-through step; directory
    // handles are not opened here because ordinary directory opens are not portable on Windows.
    Ok(())
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn create_publication_journal(
    target: &Path,
    stage: &Path,
    expected: &ProjectFileIdentity,
    candidate: &ProjectFileIdentity,
) -> Result<PathBuf, String> {
    let journal_path = project_parent(target).join(format!(
        ".bandscope-recovery-{}.journal",
        uuid::Uuid::new_v4()
    ));
    let journal = PublicationJournal {
        version: 1,
        target_name: journal_path_name(target)?,
        stage_name: journal_path_name(stage)?,
        expected: expected.clone(),
        candidate: candidate.clone(),
    };
    let bytes = serde_json::to_vec(&journal).map_err(|_| PROJECT_RECOVERY_ERROR.to_string())?;
    let mut file = match File::create_new(&journal_path) {
        Ok(file) => file,
        Err(_) => return Err(PROJECT_RECOVERY_ERROR.to_string()),
    };
    if file.write_all(&bytes).is_err()
        || file.sync_all().is_err()
        || sync_parent_directory(project_parent(target)).is_err()
    {
        drop(file);
        remove_stage(&journal_path);
        return Err(PROJECT_RECOVERY_ERROR.to_string());
    }
    Ok(journal_path)
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn project_file_identity_if_present(
    path: &Path,
) -> Result<Option<ProjectFileIdentity>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata_is_regular_project_file(&metadata) {
                return Err(PROJECT_RECOVERY_ERROR.to_string());
            }
            project_file_identity(path).map(Some)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(PROJECT_RECOVERY_ERROR.to_string()),
    }
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
fn recover_publication_state(
    target: &Path,
    journal_path: &Path,
    journal: &PublicationJournal,
    stage: &Path,
) -> Result<(), String> {
    let target_identity = project_file_identity_if_present(target)?;
    let stage_identity = project_file_identity_if_present(stage)?;

    if target_identity.as_ref() == Some(&journal.candidate)
        && stage_identity.as_ref() == Some(&journal.expected)
    {
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        if rename_exchange(stage, target).is_err() {
            return Err(PROJECT_RECOVERY_ERROR.to_string());
        }

        #[cfg(windows)]
        {
            let rollback_stage = staging_path(target)?;
            if replace_file_with_backup(target, stage, &rollback_stage).is_err() {
                return Err(PROJECT_RECOVERY_ERROR.to_string());
            }
            remove_stage(&rollback_stage);
        }
        remove_stage(stage);
        remove_stage(journal_path);
        return Ok(());
    }

    if target_identity.as_ref() == Some(&journal.expected)
        && stage_identity.as_ref() == Some(&journal.candidate)
    {
        remove_stage(stage);
        remove_stage(journal_path);
        return Ok(());
    }

    if stage_identity.is_none()
        && target_identity
            .as_ref()
            .is_some_and(|identity| identity == &journal.expected || identity == &journal.candidate)
    {
        remove_stage(journal_path);
        return Ok(());
    }

    Err(PROJECT_RECOVERY_ERROR.to_string())
}

/// Repairs one durable, adjacent publication journal when its target is selected again.
///
/// Security Notes: journal and stage names are constrained to generated same-directory names;
/// target, journal, and stage paths must stay regular non-link files; journal reads use the bounded
/// no-follow project reader; mismatched identities fail closed without deleting either file.
#[cfg(any(target_os = "linux", target_os = "macos", windows))]
pub(crate) fn recover_project_publication(target: &Path) -> Result<(), String> {
    let parent = project_parent(target);
    if !project_parent_chain_is_safe(parent) {
        return Err(PROJECT_RECOVERY_ERROR.to_string());
    }
    let target_name = journal_path_name(target)?;
    for entry in fs::read_dir(parent).map_err(|_| PROJECT_RECOVERY_ERROR.to_string())? {
        let entry = entry.map_err(|_| PROJECT_RECOVERY_ERROR.to_string())?;
        let journal_path = entry.path();
        if !recovery_journal_name(&journal_path) {
            continue;
        }
        let metadata = fs::symlink_metadata(&journal_path)
            .map_err(|_| PROJECT_RECOVERY_ERROR.to_string())?;
        if !metadata_is_regular_project_file(&metadata) {
            return Err(PROJECT_RECOVERY_ERROR.to_string());
        }
        let content = read_project_file(&journal_path)
            .map_err(|_| PROJECT_RECOVERY_ERROR.to_string())?;
        if content.len() > MAX_RECOVERY_JOURNAL_BYTES {
            return Err(PROJECT_RECOVERY_ERROR.to_string());
        }
        let journal: PublicationJournal =
            serde_json::from_str(&content).map_err(|_| PROJECT_RECOVERY_ERROR.to_string())?;
        if journal.target_name != target_name {
            continue;
        }
        if journal.version != 1 || !generated_stage_name(&journal.stage_name) {
            return Err(PROJECT_RECOVERY_ERROR.to_string());
        }
        let stage = path_from_journal_name(parent, &journal.stage_name)
            .ok_or_else(|| PROJECT_RECOVERY_ERROR.to_string())?;
        recover_publication_state(target, &journal_path, &journal, &stage)?;
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
pub(crate) fn recover_project_publication(_target: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub(crate) fn replace_existing_project_file(
    stage: &Path,
    target: &Path,
    expected: &ProjectFileIdentity,
) -> Result<(), String> {
    let candidate = project_file_identity(stage)?;
    let journal = create_publication_journal(target, stage, expected, &candidate)?;
    if rename_exchange(stage, target).is_err() {
        remove_stage(stage);
        remove_stage(&journal);
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }

    let displaced = project_file_identity(stage);
    if displaced.as_ref().is_ok_and(|identity| identity == expected) {
        remove_stage(stage);
        remove_stage(&journal);
        return Ok(());
    }

    let target_is_candidate =
        project_file_identity(target).is_ok_and(|identity| identity == candidate);
    if target_is_candidate && rename_exchange(stage, target).is_ok() {
        remove_stage(stage);
        remove_stage(&journal);
    }
    Err(PROJECT_PUBLISH_ERROR.to_string())
}

#[cfg(windows)]
pub(crate) fn replace_existing_project_file(
    stage: &Path,
    target: &Path,
    expected: &ProjectFileIdentity,
) -> Result<(), String> {
    let candidate = project_file_identity(stage)?;
    let backup = staging_path(target)?;
    let journal = create_publication_journal(target, &backup, expected, &candidate)?;
    if replace_file_with_backup(target, stage, &backup).is_err() {
        remove_stage(stage);
        remove_stage(&journal);
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }

    let displaced = project_file_identity(&backup);
    if displaced.as_ref().is_ok_and(|identity| identity == expected) {
        remove_stage(&backup);
        remove_stage(&journal);
        return Ok(());
    }

    let target_is_candidate =
        project_file_identity(target).is_ok_and(|identity| identity == candidate);
    if target_is_candidate && replace_file_with_backup(target, &backup, stage).is_ok() {
        remove_stage(stage);
        remove_stage(&journal);
    }
    Err(PROJECT_PUBLISH_ERROR.to_string())
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
pub(crate) fn replace_existing_project_file(
    stage: &Path,
    _target: &Path,
    _expected: &ProjectFileIdentity,
) -> Result<(), String> {
    remove_stage(stage);
    Err(PROJECT_PUBLISH_ERROR.to_string())
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn trusted_macos_root_alias_target(path: &Path) -> Option<&'static Path> {
    match path.to_str()? {
        "/etc" => Some(Path::new("/private/etc")),
        "/tmp" => Some(Path::new("/private/tmp")),
        "/var" => Some(Path::new("/private/var")),
        _ => None,
    }
}

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
            .is_ok_and(|target_metadata| metadata_is_safe_project_directory(&target_metadata))
}

#[cfg(not(target_os = "macos"))]
fn metadata_is_trusted_macos_root_directory_alias(_path: &Path, _metadata: &fs::Metadata) -> bool {
    false
}

fn project_parent_chain_is_safe(parent: &Path) -> bool {
    parent
        .ancestors()
        .filter(|ancestor| !ancestor.as_os_str().is_empty())
        .all(|ancestor| {
            fs::symlink_metadata(ancestor).is_ok_and(|metadata| {
                metadata_is_safe_project_directory(&metadata)
                    || metadata_is_trusted_macos_root_directory_alias(ancestor, &metadata)
            })
        })
}

fn read_project_file_with_opener<F>(target: &Path, open_file: F) -> Result<String, String>
where
    F: FnOnce(&Path) -> std::io::Result<File>,
{
    let before = fs::symlink_metadata(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    if !metadata_is_regular_project_file(&before) {
        return Err(PROJECT_READ_ERROR.to_string());
    }

    #[cfg(windows)]
    let before_file = {
        let file = open_project_file(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
        let metadata = file
            .metadata()
            .map_err(|_| PROJECT_READ_ERROR.to_string())?;
        if !metadata_is_regular_project_file(&metadata) {
            return Err(PROJECT_READ_ERROR.to_string());
        }
        file
    };

    let file = open_file(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    let opened = file
        .metadata()
        .map_err(|_| PROJECT_READ_ERROR.to_string())?;
    let after = fs::symlink_metadata(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    if !metadata_is_regular_project_file(&opened) || !metadata_is_regular_project_file(&after) {
        return Err(PROJECT_READ_ERROR.to_string());
    }

    #[cfg(unix)]
    if !same_file_identity(&before, &opened) || !same_file_identity(&opened, &after) {
        return Err(PROJECT_READ_ERROR.to_string());
    }

    #[cfg(windows)]
    {
        let after_file = open_project_file(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
        let after_opened = after_file
            .metadata()
            .map_err(|_| PROJECT_READ_ERROR.to_string())?;
        if !metadata_is_regular_project_file(&after_opened) {
            return Err(PROJECT_READ_ERROR.to_string());
        }

        let before_identity =
            windows_file_identity(&before_file).map_err(|_| PROJECT_READ_ERROR.to_string())?;
        let opened_identity =
            windows_file_identity(&file).map_err(|_| PROJECT_READ_ERROR.to_string())?;
        let after_identity =
            windows_file_identity(&after_file).map_err(|_| PROJECT_READ_ERROR.to_string())?;
        if before_identity != opened_identity || opened_identity != after_identity {
            return Err(PROJECT_READ_ERROR.to_string());
        }
    }

    #[cfg(not(any(unix, windows)))]
    return Err(PROJECT_READ_ERROR.to_string());

    let mut reader = file.take((MAX_PROJECT_FILE_BYTES + 1) as u64);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|_| PROJECT_READ_ERROR.to_string())?;
    if bytes.len() > MAX_PROJECT_FILE_BYTES {
        return Err(PROJECT_TOO_LARGE_ERROR.to_string());
    }
    String::from_utf8(bytes).map_err(|_| PROJECT_READ_ERROR.to_string())
}

/// Reads one project through a bounded, path-stable native file handle.
///
/// The selected path must name the same regular file before the open, on the opened handle, and
/// immediately after the open. Linux and macOS acquire the handle with no-follow plus non-blocking
/// flags before comparing device/inode identity, so a last-component symlink swap cannot redirect
/// handle acquisition and a special-file swap cannot block the UI thread. Windows opens reparse
/// points without following them, rejects reparse handles, and compares the volume serial number plus
/// file index returned for native handles before, during, and after acquisition. Other Unix targets
/// fail closed until their no-follow open contract is explicitly modeled. The reader remains capped
/// at `MAX_PROJECT_FILE_BYTES + 1`; backup rotation and migration semantics remain later #962 work.
pub(crate) fn read_project_file(target: &Path) -> Result<String, String> {
    read_project_file_with_opener(target, open_project_file)
}

/// Publishes a selected project only after its complete bounded bytes are staged and synced.
///
/// The selected parent and each lexical ancestor must be a real directory rather than a
/// symlink/reparse point before any staging artifact is created. On macOS, only the canonical
/// root-owned `/etc`, `/tmp`, and `/var` aliases are admitted, and each must resolve to its exact
/// `/private` system directory; arbitrary root-level aliases remain fail-closed. This rejects
/// user-writable static ancestor-link redirection without breaking normal paths below macOS system
/// aliases. `File::create_new` makes staging non-clobbering. If the selected target exists, its native
/// identity and permissions are captured from the same pre-staging metadata snapshot on Unix; the
/// staged inode receives those permissions after its bytes are written and before it is synced.
/// Linux and macOS then atomically exchange the synced staging inode with the target and accept the
/// publication only when the displaced inode still matches that captured identity; a mismatch is
/// exchanged back before returning an error. Windows uses `ReplaceFileW` with a unique same-directory
/// backup, validates the displaced file's native identity, and restores it when the snapshot no longer
/// matches. For a destination that was absent at the snapshot, a hard link is attempted first; Linux
/// then uses `renameat2(RENAME_NOREPLACE)`, macOS uses `renamex_np(RENAME_EXCL)`, and Windows uses
/// `MoveFileExW` without `MOVEFILE_REPLACE_EXISTING` so a concurrently appearing destination is not
/// clobbered. Filesystems without the required native primitive fail closed. These checks do not claim
/// descriptor-bound protection for a parent-chain swap or authority before the first post-dialog
/// identity snapshot. A durable adjacent journal repairs an interrupted mismatch rollback the next
/// time the same target is selected; global startup scanning and backup rotation remain #962 work.
pub(crate) fn publish_new_project_file(target: &Path, content: &[u8]) -> Result<(), String> {
    publish_new_project_file_with_linker(target, content, |source, destination| {
        fs::hard_link(source, destination)
    })
}

pub(crate) fn publish_new_project_file_with_linker<F>(
    target: &Path,
    content: &[u8],
    link: F,
) -> Result<(), String>
where
    F: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if content.is_empty() {
        return Err(PROJECT_STAGE_ERROR.to_string());
    }
    if content.len() > MAX_PROJECT_FILE_BYTES {
        return Err(PROJECT_TOO_LARGE_ERROR.to_string());
    }

    let parent = project_parent(target);
    if !project_parent_chain_is_safe(parent) {
        return Err(PROJECT_STAGE_ERROR.to_string());
    }

    let expected_target = match fs::symlink_metadata(target) {
        Ok(metadata) => {
            if !metadata_is_regular_project_file(&metadata) {
                return Err(PROJECT_PUBLISH_ERROR.to_string());
            }
            #[cfg(unix)]
            let identity = project_file_identity_from_metadata(&metadata);
            #[cfg(not(unix))]
            let identity = project_file_identity(target)?;
            Some((identity, metadata.permissions()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err(PROJECT_PUBLISH_ERROR.to_string()),
    };

    let stage = staging_path(target)?;
    let mut staged = File::create_new(&stage).map_err(|_| PROJECT_STAGE_ERROR.to_string())?;
    if staged.write_all(content).is_err() {
        drop(staged);
        remove_stage(&stage);
        return Err(PROJECT_STAGE_ERROR.to_string());
    }
    #[cfg(unix)]
    if let Some((_, permissions)) = expected_target.as_ref() {
        if staged.set_permissions(permissions.clone()).is_err() {
            drop(staged);
            remove_stage(&stage);
            return Err(PROJECT_STAGE_ERROR.to_string());
        }
    }
    if staged.sync_all().is_err() {
        drop(staged);
        remove_stage(&stage);
        return Err(PROJECT_STAGE_ERROR.to_string());
    }
    drop(staged);

    if let Some((expected, _)) = expected_target {
        return replace_existing_project_file(&stage, target, &expected);
    }

    if let Err(error) = link(&stage, target) {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            remove_stage(&stage);
            return Err(PROJECT_EXISTS_ERROR.to_string());
        }

        match rename_noreplace(&stage, target) {
            Ok(()) => return Ok(()),
            Err(publish_error) if publish_error.kind() == std::io::ErrorKind::AlreadyExists => {
                remove_stage(&stage);
                return Err(PROJECT_EXISTS_ERROR.to_string());
            }
            Err(_) => {
                remove_stage(&stage);
                return Err(PROJECT_PUBLISH_ERROR.to_string());
            }
        }
    }

    // Both names reference the already-synced inode at this point. Cleanup failure does not make the
    // published target partial, so do not report a false save failure after publication succeeded.
    remove_stage(&stage);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        publish_new_project_file, read_project_file, read_project_file_with_opener,
        MAX_PROJECT_FILE_BYTES,
    };
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
            "bandscope-project-persistence-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    #[cfg(any(target_os = "linux", target_os = "macos", windows))]
    #[test]
    fn native_no_replace_rename_preserves_a_competing_destination() {
        let root = test_dir("rename-noreplace-conflict");
        let stage = root.join("candidate.stage");
        let target = root.join("setlist.bscope");
        let candidate = br#"{\"id\":\"candidate\"}"#;
        let competing = br#"{\"id\":\"competing\"}"#;
        fs::write(&stage, candidate).expect("candidate stage should be written");
        fs::write(&target, competing).expect("competing target should be written");

        let error = super::rename_noreplace(&stage, &target)
            .expect_err("native no-replace rename must refuse an existing target");

        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(
            fs::read(&target).expect("competing target should remain readable"),
            competing
        );
        assert_eq!(
            fs::read(&stage).expect("candidate stage should remain after conflict"),
            candidate
        );
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[cfg(any(target_os = "linux", target_os = "macos", windows))]
    #[test]
    fn native_no_replace_rename_publishes_when_destination_is_absent() {
        let root = test_dir("rename-noreplace-new");
        let stage = root.join("candidate.stage");
        let target = root.join("setlist.bscope");
        let candidate = br#"{\"id\":\"candidate\"}"#;
        fs::write(&stage, candidate).expect("candidate stage should be written");

        super::rename_noreplace(&stage, &target)
            .expect("native no-replace rename should publish an absent target");

        assert_eq!(
            fs::read(&target).expect("published target should be readable"),
            candidate
        );
        assert!(!stage.exists());
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn publishes_complete_new_project_without_stage_artifacts() {
        let root = test_dir("new");
        let target = root.join("setlist.bscope");
        let content = br#"{\"id\":\"song-1\"}"#;

        publish_new_project_file(&target, content).expect("new project should publish safely");

        assert_eq!(
            fs::read(&target).expect("published project should be readable"),
            content
        );
        let names = fs::read_dir(&root)
            .expect("test directory should be readable")
            .map(|entry| {
                entry
                    .expect("directory entry should be readable")
                    .file_name()
            })
            .collect::<Vec<_>>();
        assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn stages_a_project_with_a_max_length_file_name() {
        let root = test_dir("max-name");
        let target = root.join("a".repeat(255));

        publish_new_project_file(&target, br#"{"id":"song-1"}"#)
            .expect("a max-length target name should still be stageable");

        assert!(target.is_file());
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn invalid_replacement_does_not_clobber_an_existing_known_good_project() {
        let root = test_dir("existing-invalid");
        let target = root.join("setlist.bscope");
        let known_good = br#"{\"id\":\"known-good\"}"#;
        fs::write(&target, known_good).expect("fixture should be written");

        let error = publish_new_project_file(&target, b"")
            .expect_err("invalid replacement must fail before publication");

        assert_eq!(error, "Could not stage the project safely.");
        assert_eq!(
            fs::read(&target).expect("known-good project should remain"),
            known_good
        );
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_to_replace_a_symlink_target() {
        use std::os::unix::fs::symlink;

        let root = test_dir("save-symlink");
        let external = root.join("external.bscope");
        let selected = root.join("selected.bscope");
        let known_good = br#"{\"id\":\"external-known-good\"}"#;
        fs::write(&external, known_good).expect("external fixture should be written");
        symlink(&external, &selected).expect("fixture symlink should be created");

        let error = publish_new_project_file(&selected, br#"{\"id\":\"replacement\"}"#)
            .expect_err("a selected symlink must not be replaced as project authority");

        assert_eq!(error, "Could not publish the project safely.");
        assert_eq!(
            fs::read(&external).expect("external project should remain readable"),
            known_good
        );
        assert!(fs::symlink_metadata(&selected)
            .expect("selected symlink should remain")
            .file_type()
            .is_symlink());
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn rejects_project_bytes_beyond_the_existing_load_limit_before_staging() {
        let root = test_dir("oversize");
        let target = root.join("setlist.bscope");
        let content = vec![b'x'; MAX_PROJECT_FILE_BYTES + 1];

        let error = publish_new_project_file(&target, &content)
            .expect_err("oversized project should fail before publication");

        assert_eq!(error, "Project file is too large (exceeds 5MB limit)");
        assert!(!target.exists());
        assert_eq!(
            fs::read_dir(&root)
                .expect("directory should be readable")
                .count(),
            0
        );
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn reads_project_content_within_the_existing_load_limit() {
        let root = test_dir("read-valid");
        let target = root.join("setlist.bscope");
        let content = r#"{"id":"song-1"}"#;
        fs::write(&target, content).expect("fixture should be written");

        assert_eq!(
            read_project_file(&target).expect("bounded project should be readable"),
            content
        );
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_symlink_before_reading_external_content() {
        use std::os::unix::fs::symlink;

        let root = test_dir("read-symlink");
        let external = root.join("external.json");
        let selected = root.join("selected.bscope");
        fs::write(&external, r#"{"id":"external"}"#).expect("external fixture should be written");
        symlink(&external, &selected).expect("fixture symlink should be created");

        let error = read_project_file(&selected)
            .expect_err("a selected symlink must not redirect the project reader");

        assert_eq!(error, "Failed to read file");
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn rejects_project_replaced_between_preflight_and_open() {
        let root = test_dir("read-swap");
        let selected = root.join("selected.bscope");
        let replacement = root.join("replacement.bscope");
        let parked = root.join("parked.bscope");
        fs::write(&selected, r#"{"id":"selected"}"#).expect("selected fixture should be written");
        fs::write(&replacement, r#"{"id":"replacement-with-different-bytes"}"#)
            .expect("replacement fixture should be written");

        let error = read_project_file_with_opener(&selected, |path| {
            fs::rename(path, &parked)?;
            fs::rename(&replacement, path)?;
            fs::File::open(path)
        })
        .expect_err("a path replacement between preflight and open must fail closed");

        assert_eq!(error, "Failed to read file");
        fs::remove_dir_all(root).expect("test fixture should be removable");
    }

    #[test]
    fn rejects_oversized_project_during_the_read_itself() {
        let root = test_dir("read-oversize");
        let target = root.join("setlist.bscope");
        let file = fs::File::create(&target).expect("fixture should be created");
        file.set_len((MAX_PROJECT_FILE_BYTES + 1) as u64)
            .expect("sparse oversize fixture should be sized");
        drop(file);

        let error = read_project_file(&target)
            .expect_err("the project reader must enforce the byte ceiling while reading");

        assert_eq!(error, "Project file is too large (exceeds 5MB limit)");
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[cfg(any(target_os = "linux", target_os = "macos", windows))]
    #[test]
    fn recovers_an_interrupted_existing_project_publication() {
        let root = test_dir("recovery");
        let target = root.join("setlist.bscope");
        let stage = root.join(format!(".bandscope-stage-{}.stage", uuid::Uuid::new_v4()));
        let known_good = br#"{"id":"known-good"}"#;
        let candidate = br#"{"id":"candidate"}"#;
        fs::write(&target, known_good).expect("known-good fixture should be written");
        fs::write(&stage, candidate).expect("candidate fixture should be written");

        let expected = super::project_file_identity(&target).expect("target identity should exist");
        let candidate_identity =
            super::project_file_identity(&stage).expect("candidate identity should exist");
        let journal = super::create_publication_journal(
            &target,
            &stage,
            &expected,
            &candidate_identity,
        )
        .expect("the recovery journal should be durable before publication");
        super::rename_exchange(&stage, &target).expect("fixture should model interrupted exchange");

        super::recover_project_publication(&target)
            .expect("the next selection should recover the known-good target");

        assert_eq!(fs::read(&target).expect("target should remain readable"), known_good);
        assert!(!stage.exists(), "the interrupted candidate should be cleaned");
        assert!(!journal.exists(), "the recovery journal should be cleaned");
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn save_project_command_routes_through_safe_publisher() {
        let main_source = include_str!("main.rs");

        assert!(
            main_source.contains("project_persistence::publish_new_project_file"),
            "the Tauri save command must use the staged project publisher"
        );
        assert!(
            !main_source.contains("std::fs::write(path, content)"),
            "the Tauri save command must not truncate the selected destination directly"
        );
    }

    #[test]
    fn load_project_command_routes_through_bounded_reader() {
        let main_source = include_str!("main.rs");

        assert!(
            main_source.contains("project_persistence::read_project_file(&path)"),
            "the Tauri load command must enforce the byte ceiling while reading"
        );
        assert!(
            !main_source.contains("std::fs::read_to_string(path)"),
            "the Tauri load command must not allocate through an unbounded second read"
        );
    }
}
