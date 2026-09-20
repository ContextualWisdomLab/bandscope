use crate::{is_valid_score_id, MAX_SCORE_PDF_BYTES, PDF_MAGIC};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

const SCORE_ATTACH_ERROR: &str = "Could not attach the score PDF.";
const SCORE_REMOVE_ERROR: &str = "Could not remove the score PDF.";
const SCORE_TOO_LARGE_ERROR: &str = "Score PDF is too large (exceeds 25MB limit).";
const SCORE_INVALID_PDF_ERROR: &str = "The selected file is not a valid PDF.";
const COPY_BUFFER_BYTES: usize = 64 * 1024;

fn create_private_stage(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Deny pathname sharing while bytes are being written. Windows also
        // denies the later hard-link/unlink operations while this handle is
        // open, so publication deliberately starts only after the synchronized
        // stage handle is closed.
        options.share_mode(0);
    }

    options
        .open(path)
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())
}

fn copy_bounded_pdf_stream(
    reader: &mut impl Read,
    writer: &mut impl Write,
    expected_len: u64,
) -> Result<u64, String> {
    if expected_len == 0 {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    if expected_len > MAX_SCORE_PDF_BYTES {
        return Err(SCORE_TOO_LARGE_ERROR.to_string());
    }

    let mut buffer = [0_u8; COPY_BUFFER_BYTES];
    let mut total = 0_u64;
    let mut magic = [0_u8; PDF_MAGIC.len()];
    let mut magic_len = 0_usize;

    while total < expected_len {
        let remaining = (expected_len - total) as usize;
        let read_len = remaining.min(buffer.len());
        let count = reader
            .read(&mut buffer[..read_len])
            .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
        if count == 0 {
            return Err(SCORE_ATTACH_ERROR.to_string());
        }

        if magic_len < magic.len() {
            let take = (magic.len() - magic_len).min(count);
            magic[magic_len..magic_len + take].copy_from_slice(&buffer[..take]);
            magic_len += take;
        }

        writer
            .write_all(&buffer[..count])
            .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
        total += count as u64;
    }

    let mut growth_probe = [0_u8; 1];
    if reader
        .read(&mut growth_probe)
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?
        != 0
    {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    if magic_len != magic.len() || magic != PDF_MAGIC {
        return Err(SCORE_INVALID_PDF_ERROR.to_string());
    }

    Ok(total)
}

#[cfg(unix)]
#[derive(Clone, Copy, PartialEq, Eq)]
struct StageIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn stage_identity(file: &File) -> Result<StageIdentity, String> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    Ok(StageIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
#[repr(C)]
struct WindowsFileId128 {
    identifier: [u8; 16],
}

#[cfg(windows)]
#[repr(C)]
struct WindowsFileIdInfo {
    volume_serial_number: u64,
    file_id: WindowsFileId128,
}

#[cfg(windows)]
#[repr(C)]
struct WindowsFileDispositionInfo {
    delete_file: u8,
}

#[cfg(windows)]
const FILE_ID_INFO_CLASS: i32 = 0x12;
#[cfg(windows)]
const FILE_DISPOSITION_INFO_CLASS: i32 = 4;
#[cfg(windows)]
const DELETE_ACCESS: u32 = 0x0001_0000;
#[cfg(windows)]
const FILE_READ_ATTRIBUTES: u32 = 0x0000_0080;
#[cfg(windows)]
const FILE_SHARE_READ: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_SHARE_WRITE: u32 = 0x0000_0002;
#[cfg(windows)]
const FILE_SHARE_DELETE: u32 = 0x0000_0004;
#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GetFileInformationByHandleEx(
        file: *mut std::ffi::c_void,
        file_information_class: i32,
        file_information: *mut std::ffi::c_void,
        buffer_size: u32,
    ) -> i32;
    fn SetFileInformationByHandle(
        file: *mut std::ffi::c_void,
        file_information_class: i32,
        file_information: *mut std::ffi::c_void,
        buffer_size: u32,
    ) -> i32;
}

#[cfg(windows)]
#[derive(Clone, Copy, PartialEq, Eq)]
struct StageIdentity {
    volume_serial_number: u64,
    file_id: [u8; 16],
}

#[cfg(windows)]
fn stage_identity(file: &File) -> Result<StageIdentity, String> {
    use std::{
        mem::{size_of, MaybeUninit},
        os::windows::io::AsRawHandle,
    };

    let mut info = MaybeUninit::<WindowsFileIdInfo>::zeroed();
    // FILE_ID_INFO is the Windows identity contract here: volume serial plus
    // the 128-bit file id avoids treating a pathname as cleanup authority.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FILE_ID_INFO_CLASS,
            info.as_mut_ptr().cast(),
            size_of::<WindowsFileIdInfo>() as u32,
        )
    };
    if result == 0 {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    let info = unsafe { info.assume_init() };
    Ok(StageIdentity {
        volume_serial_number: info.volume_serial_number,
        file_id: info.file_id.identifier,
    })
}

#[cfg(unix)]
fn destination_matches_stage(
    path: &Path,
    expected: StageIdentity,
    written: u64,
) -> Result<bool, String> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};

    let entry = fs::symlink_metadata(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !entry.is_file()
        || entry.len() != written
        || entry.dev() != expected.device
        || entry.ino() != expected.inode
    {
        return Ok(false);
    }

    let file = OpenOptions::new()
        .read(true)
        .custom_flags(O_NOFOLLOW)
        .open(path)
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let opened = file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    Ok(opened.is_file() && opened.len() == written && stage_identity(&file)? == expected)
}

#[cfg(windows)]
fn destination_matches_stage(
    path: &Path,
    expected: StageIdentity,
    written: u64,
) -> Result<bool, String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

    let entry = fs::symlink_metadata(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !entry.is_file()
        || entry.len() != written
        || entry.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Ok(false);
    }

    let mut options = OpenOptions::new();
    options
        .access_mode(FILE_READ_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options
        .open(path)
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let opened = file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    Ok(opened.is_file()
        && opened.len() == written
        && opened.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
        && stage_identity(&file)? == expected)
}

#[cfg(all(not(unix), not(windows)))]
fn destination_matches_stage(
    _path: &Path,
    _expected: StageIdentity,
    _written: u64,
) -> Result<bool, String> {
    Err(SCORE_ATTACH_ERROR.to_string())
}

#[cfg(windows)]
fn open_windows_delete_handle(path: &Path, error: &str) -> Result<File, String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

    let path_metadata = fs::symlink_metadata(path).map_err(|_| error.to_string())?;
    if !path_metadata.is_file()
        || path_metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(error.to_string());
    }

    let mut options = OpenOptions::new();
    options
        .access_mode(DELETE_ACCESS | FILE_READ_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options.open(path).map_err(|_| error.to_string())?;
    let opened_metadata = file.metadata().map_err(|_| error.to_string())?;
    if !opened_metadata.is_file()
        || opened_metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(error.to_string());
    }
    Ok(file)
}

#[cfg(windows)]
fn mark_windows_handle_for_deletion(file: &File, error: &str) -> Result<(), String> {
    use std::{mem::size_of, os::windows::io::AsRawHandle};

    let mut disposition = WindowsFileDispositionInfo { delete_file: 1 };
    let result = unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FILE_DISPOSITION_INFO_CLASS,
            (&mut disposition as *mut WindowsFileDispositionInfo).cast(),
            size_of::<WindowsFileDispositionInfo>() as u32,
        )
    };
    if result == 0 {
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(all(not(unix), not(windows)))]
#[derive(Clone, Copy)]
struct StageIdentity;

#[cfg(all(not(unix), not(windows)))]
fn stage_identity(_file: &File) -> Result<StageIdentity, String> {
    Ok(StageIdentity)
}

#[cfg(unix)]
fn remove_owned_stage_with_hook<F>(
    path: &Path,
    expected: StageIdentity,
    before_unlink: F,
) -> Result<(), String>
where
    F: FnOnce(),
{
    use std::{ffi::CString, os::fd::AsRawFd, os::unix::ffi::OsStrExt};

    let parent = path
        .parent()
        .ok_or_else(|| SCORE_ATTACH_ERROR.to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| SCORE_ATTACH_ERROR.to_string())?;
    let parent_file = File::open(parent).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !parent_file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?
        .is_dir()
    {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    let name = CString::new(file_name.as_bytes()).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let target_file =
        open_score_entry_at(&parent_file, &name).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let target_metadata = target_file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !target_metadata.is_file() || stage_identity(&target_file)? != expected {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    before_unlink();

    let current_file =
        open_score_entry_at(&parent_file, &name).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let current_metadata = current_file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !current_metadata.is_file() || stage_identity(&current_file)? != expected {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    let result = unsafe { unlinkat(parent_file.as_raw_fd(), name.as_ptr(), 0) };
    if result != 0 {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    Ok(())
}

#[cfg(unix)]
fn remove_owned_stage(path: &Path, expected: StageIdentity) -> Result<(), String> {
    remove_owned_stage_with_hook(path, expected, || {})
}

#[cfg(windows)]
fn remove_owned_stage_with_hook<F>(
    path: &Path,
    expected: StageIdentity,
    before_unlink: F,
) -> Result<(), String>
where
    F: FnOnce(),
{
    let current_file = open_windows_delete_handle(path, SCORE_ATTACH_ERROR)?;
    if stage_identity(&current_file)? != expected {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    before_unlink();

    mark_windows_handle_for_deletion(&current_file, SCORE_ATTACH_ERROR)?;
    drop(current_file);
    Ok(())
}

#[cfg(windows)]
fn remove_owned_stage(path: &Path, expected: StageIdentity) -> Result<(), String> {
    remove_owned_stage_with_hook(path, expected, || {})
}

#[cfg(all(not(unix), not(windows)))]
fn remove_owned_stage(path: &Path, _expected: StageIdentity) -> Result<(), String> {
    let current = fs::symlink_metadata(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !current.is_file() {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    fs::remove_file(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())
}

#[cfg(unix)]
const O_RDONLY: i32 = 0;
#[cfg(any(target_os = "linux", target_os = "android"))]
const O_NOFOLLOW: i32 = 0x0002_0000;
#[cfg(all(unix, not(any(target_os = "linux", target_os = "android"))))]
const O_NOFOLLOW: i32 = 0x0000_0100;

#[cfg(unix)]
extern "C" {
    fn openat(dirfd: i32, pathname: *const std::os::raw::c_char, flags: i32) -> i32;
    fn unlinkat(dirfd: i32, pathname: *const std::os::raw::c_char, flags: i32) -> i32;
}

#[cfg(unix)]
fn open_score_entry_at(parent: &File, name: &std::ffi::CString) -> Result<File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let fd = unsafe { openat(parent.as_raw_fd(), name.as_ptr(), O_RDONLY | O_NOFOLLOW) };
    if fd < 0 {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}

#[cfg(unix)]
fn remove_score_pdf_attachment_with_hook<F>(path: &Path, before_unlink: F) -> Result<(), String>
where
    F: FnOnce(),
{
    use std::{ffi::CString, os::fd::AsRawFd, os::unix::ffi::OsStrExt};

    let parent = path
        .parent()
        .ok_or_else(|| SCORE_REMOVE_ERROR.to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| SCORE_REMOVE_ERROR.to_string())?;
    let parent_file = File::open(parent).map_err(|_| SCORE_REMOVE_ERROR.to_string())?;
    if !parent_file
        .metadata()
        .map_err(|_| SCORE_REMOVE_ERROR.to_string())?
        .is_dir()
    {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }
    let name = CString::new(file_name.as_bytes()).map_err(|_| SCORE_REMOVE_ERROR.to_string())?;
    let target_file = open_score_entry_at(&parent_file, &name)?;
    let target_metadata = target_file
        .metadata()
        .map_err(|_| SCORE_REMOVE_ERROR.to_string())?;
    if !target_metadata.is_file() {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }
    let expected = stage_identity(&target_file).map_err(|_| SCORE_REMOVE_ERROR.to_string())?;

    before_unlink();

    // Re-open by basename under the already-open parent directory. This keeps
    // ancestor replacement out of the authority check. The remaining
    // identity-check-to-unlinkat interval is documented as residual TOCTOU.
    let current_file = open_score_entry_at(&parent_file, &name)?;
    let current_metadata = current_file
        .metadata()
        .map_err(|_| SCORE_REMOVE_ERROR.to_string())?;
    if !current_metadata.is_file()
        || stage_identity(&current_file).map_err(|_| SCORE_REMOVE_ERROR.to_string())? != expected
    {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }

    let result = unsafe { unlinkat(parent_file.as_raw_fd(), name.as_ptr(), 0) };
    if result != 0 {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }
    Ok(())
}

#[cfg(windows)]
fn remove_score_pdf_attachment_with_hook<F>(path: &Path, before_unlink: F) -> Result<(), String>
where
    F: FnOnce(),
{
    let file = open_windows_delete_handle(path, SCORE_REMOVE_ERROR)?;

    before_unlink();

    mark_windows_handle_for_deletion(&file, SCORE_REMOVE_ERROR)?;
    drop(file);
    Ok(())
}

#[cfg(all(not(unix), not(windows)))]
fn remove_score_pdf_attachment_with_hook<F>(path: &Path, before_unlink: F) -> Result<(), String>
where
    F: FnOnce(),
{
    let metadata = fs::symlink_metadata(path).map_err(|_| SCORE_REMOVE_ERROR.to_string())?;
    if !metadata.is_file() {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }
    before_unlink();
    fs::remove_file(path).map_err(|_| SCORE_REMOVE_ERROR.to_string())
}

/// Remove one score attachment after the caller has resolved it inside the
/// app-owned score workspace.
///
/// Windows opens the exact file object with DELETE authority and marks that
/// same handle for deletion with `SetFileInformationByHandle(FileDispositionInfo)`,
/// so a later pathname replacement cannot redirect deletion to a foreign file.
/// Unix pins the parent directory, opens the basename with `O_NOFOLLOW`,
/// rechecks device/inode identity through that directory descriptor, and then
/// calls `unlinkat`. Unix still has a narrow identity-check-to-`unlinkat` race;
/// callers must not treat this as a race-free object deletion primitive.
///
/// Security Notes: no absolute path or file content is returned in errors. A
/// reparse/symlink entry, non-regular object, identity change, or OS deletion
/// failure is fail-closed.
pub fn remove_score_pdf_attachment(path: &Path) -> Result<(), String> {
    remove_score_pdf_attachment_with_hook(path, || {})
}

fn publish_score_pdf_attachment_with_hook<F>(
    source: &Path,
    scores_root: &Path,
    score_id: &str,
    after_link: F,
) -> Result<u64, String>
where
    F: FnOnce(&Path, &Path),
{
    if !is_valid_score_id(score_id) {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    let mut source_file = File::open(source).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let source_metadata = source_file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !source_metadata.is_file() {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    let expected_len = source_metadata.len();
    if expected_len > MAX_SCORE_PDF_BYTES {
        return Err(SCORE_TOO_LARGE_ERROR.to_string());
    }

    let stage = scores_root.join(format!(".score-{score_id}.stage"));
    let destination = scores_root.join(format!("{score_id}.pdf"));
    let mut stage_file = create_private_stage(&stage)?;
    let expected_stage = stage_identity(&stage_file)?;

    let copy_result = copy_bounded_pdf_stream(&mut source_file, &mut stage_file, expected_len)
        .and_then(|written| {
            let after = source_file
                .metadata()
                .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
            if after.len() != expected_len {
                return Err(SCORE_ATTACH_ERROR.to_string());
            }
            stage_file
                .sync_all()
                .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
            Ok(written)
        });

    let written = match copy_result {
        Ok(written) => written,
        Err(error) => {
            drop(stage_file);
            let _ = remove_owned_stage(&stage, expected_stage);
            return Err(error);
        }
    };

    // Windows cannot create a hard link to, or unlink, a path whose handle was
    // opened with share_mode(0). Closing only after sync preserves exclusive
    // write ownership while making the completed stage publishable.
    drop(stage_file);

    if fs::hard_link(&stage, &destination).is_err() {
        let _ = remove_owned_stage(&stage, expected_stage);
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    after_link(&stage, &destination);

    // A same-length regular-file replacement is not the object we staged.
    // Attest the pathname to the synchronized stage identity both before and
    // after retiring the temporary alias; unexpected replacements are kept as
    // evidence rather than unlinked through pathname authority.
    if !matches!(
        destination_matches_stage(&destination, expected_stage, written),
        Ok(true)
    ) {
        let _ = remove_owned_stage(&stage, expected_stage);
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    remove_owned_stage(&stage, expected_stage)?;

    if !matches!(
        destination_matches_stage(&destination, expected_stage, written),
        Ok(true)
    ) {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    Ok(written)
}

/// Publish one validated score PDF into the app-owned score workspace.
///
/// The source is reopened once and copied from that descriptor with a fixed
/// 25 MiB ceiling. The descriptor length is snapshotted before copy; early EOF
/// and an extra byte after the snapshot both fail closed, so truncation or
/// growth cannot silently change the accepted resource. The staging file is
/// created with `create_new`; Unix requests mode `0600` at first visibility,
/// while Windows deliberately inherits the app-owned parent ACL. Publication
/// uses a hard link so an existing `<score_id>.pdf` is never replaced. Before
/// returning attachment authority, the destination is matched to the exact
/// synchronized stage object by device/inode on Unix or volume/file ID on
/// Windows, with a second check after the temporary stage alias is retired.
///
/// Security Notes: errors never include the source path or PDF bytes. Unix
/// stage cleanup pins the parent directory, opens the reserved basename with
/// `O_NOFOLLOW`, rechecks device/inode identity, and unlinks through `unlinkat`;
/// the narrow final identity-check-to-`unlinkat` race remains explicit. Windows
/// opens the exact stage object with DELETE authority, verifies its volume plus
/// 128-bit file id against the captured identity, then marks that same handle
/// for deletion so a late pathname replacement cannot redirect cleanup. Final
/// destination attestation is identity-based but does not claim immunity from a
/// replacement that occurs after the last attestation and before the caller's
/// later use of the returned attachment.
pub fn publish_score_pdf_attachment(
    source: &Path,
    scores_root: &Path,
    score_id: &str,
) -> Result<u64, String> {
    publish_score_pdf_attachment_with_hook(source, scores_root, score_id, |_, _| {})
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Cursor,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
    }

    #[test]
    fn bounded_stream_rejects_growth_after_length_snapshot() {
        let mut reader = Cursor::new(b"%PDF-extra".to_vec());
        let mut output = Vec::new();

        let error = copy_bounded_pdf_stream(&mut reader, &mut output, PDF_MAGIC.len() as u64)
            .expect_err("growth after the descriptor snapshot must fail closed");

        assert_eq!(error, SCORE_ATTACH_ERROR);
    }

    #[test]
    fn bounded_stream_rejects_truncation_after_length_snapshot() {
        let mut reader = Cursor::new(PDF_MAGIC.to_vec());
        let mut output = Vec::new();

        let error = copy_bounded_pdf_stream(
            &mut reader,
            &mut output,
            (PDF_MAGIC.len() + 1) as u64,
        )
        .expect_err("truncation after the metadata snapshot must fail closed");

        assert_eq!(error, SCORE_ATTACH_ERROR);
    }

    #[test]
    fn bounded_stream_rejects_wrong_magic_without_payload_echo() {
        let bytes = b"PK\x03\x04-not-pdf";
        let mut reader = Cursor::new(bytes.to_vec());
        let mut output = Vec::new();

        let error = copy_bounded_pdf_stream(&mut reader, &mut output, bytes.len() as u64)
            .expect_err("wrong magic must fail closed");

        assert_eq!(error, SCORE_INVALID_PDF_ERROR);
        assert!(!error.contains("PK"));
    }

    #[test]
    fn score_attachment_delete_removes_authorized_regular_file() {
        let root = unique_test_dir("score-delete");
        fs::create_dir_all(&root).expect("score root should be created");
        let target = root.join("score.pdf");
        fs::write(&target, b"%PDF-delete").expect("score fixture should be written");

        remove_score_pdf_attachment(&target).expect("authorized score should be removed");

        assert!(!target.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn publication_rejects_same_length_foreign_destination_replacement() {
        const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

        let root = unique_test_dir("score-publication-identity");
        fs::create_dir_all(&root).expect("score root should be created");
        let source = root.join("selected.pdf");
        let moved = root.join("owned-published.pdf");
        fs::write(&source, b"%PDF-owned").expect("score fixture should be written");

        let error = publish_score_pdf_attachment_with_hook(
            &source,
            &root,
            SCORE_ID,
            |_, destination| {
                fs::rename(destination, &moved)
                    .expect("published owned link should move before attestation");
                fs::write(destination, b"%PDF-other")
                    .expect("same-length foreign replacement should be written");
            },
        )
        .expect_err("same-length foreign destination must fail identity attestation");

        assert_eq!(error, SCORE_ATTACH_ERROR);
        assert_eq!(
            fs::read(root.join(format!("{SCORE_ID}.pdf")))
                .expect("foreign replacement should remain as evidence"),
            b"%PDF-other"
        );
        assert_eq!(
            fs::read(&moved).expect("owned publication should remain preserved"),
            b"%PDF-owned"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn unix_delete_preserves_replacement_before_descriptor_relative_unlink() {
        let root = unique_test_dir("score-delete-unix-replacement");
        fs::create_dir_all(&root).expect("score root should be created");
        let target = root.join("score.pdf");
        let moved = root.join("owned-before-replacement.pdf");
        fs::write(&target, b"%PDF-owned").expect("owned score should be written");

        let error = remove_score_pdf_attachment_with_hook(&target, || {
            fs::rename(&target, &moved).expect("owned score should move inside the same directory");
            fs::write(&target, b"%PDF-foreign").expect("foreign replacement should be written");
        })
        .expect_err("identity mismatch must fail closed before unlinkat");

        assert_eq!(error, SCORE_REMOVE_ERROR);
        assert_eq!(
            fs::read(&target).expect("replacement should survive"),
            b"%PDF-foreign"
        );
        assert_eq!(
            fs::read(&moved).expect("owned file should survive failed deletion"),
            b"%PDF-owned"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn unix_stage_cleanup_preserves_replacement_before_descriptor_relative_unlink() {
        let root = unique_test_dir("score-stage-cleanup-unix-replacement");
        fs::create_dir_all(&root).expect("score root should be created");
        let stage = root.join("stage.pdf");
        let moved = root.join("owned-before-replacement.pdf");
        let stage_file = create_private_stage(&stage).expect("owned stage should be created");
        let expected = stage_identity(&stage_file).expect("owned stage identity should be captured");
        drop(stage_file);

        let error = remove_owned_stage_with_hook(&stage, expected, || {
            fs::rename(&stage, &moved).expect("owned stage should move after identity check");
            fs::write(&stage, b"foreign replacement").expect("foreign replacement should be written");
        })
        .expect_err("identity mismatch must fail closed before stage unlinkat");

        assert_eq!(error, SCORE_ATTACH_ERROR);
        assert_eq!(
            fs::read(&stage).expect("foreign replacement must survive cleanup"),
            b"foreign replacement"
        );
        assert_eq!(
            fs::read(&moved).expect("owned stage must survive failed cleanup"),
            b""
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_delete_marks_open_file_object_not_replacement_path() {
        let root = unique_test_dir("score-delete-windows-replacement");
        fs::create_dir_all(&root).expect("score root should be created");
        let target = root.join("score.pdf");
        let moved = root.join("owned-before-replacement.pdf");
        fs::write(&target, b"%PDF-owned").expect("owned score should be written");

        remove_score_pdf_attachment_with_hook(&target, || {
            fs::rename(&target, &moved).expect("owned score should move while delete handle is open");
            fs::write(&target, b"%PDF-foreign").expect("foreign replacement should be written");
        })
        .expect("handle-bound disposition should delete only the originally opened score");

        assert_eq!(
            fs::read(&target).expect("replacement should survive"),
            b"%PDF-foreign"
        );
        assert!(
            !moved.exists(),
            "the originally opened score object should be deleted"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_stage_cleanup_deletes_owned_object_not_replacement_path() {
        let root = unique_test_dir("score-stage-cleanup-replacement");
        fs::create_dir_all(&root).expect("score root should be created");
        let stage = root.join("stage.pdf");
        let moved = root.join("owned-before-replacement.pdf");
        let stage_file = create_private_stage(&stage).expect("owned stage should be created");
        let expected = stage_identity(&stage_file).expect("owned stage identity should be captured");
        drop(stage_file);

        remove_owned_stage_with_hook(&stage, expected, || {
            fs::rename(&stage, &moved).expect("owned stage should move after identity check");
            fs::write(&stage, b"foreign replacement").expect("foreign replacement should be written");
        })
        .expect("cleanup should delete the captured stage object, not the replacement pathname");

        assert_eq!(
            fs::read(&stage).expect("foreign replacement must survive cleanup"),
            b"foreign replacement"
        );
        assert!(
            !moved.exists(),
            "the captured stage object should be deleted through its original authority"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_cleanup_preserves_replaced_stage_path() {
        let root = unique_test_dir("score-stage-identity");
        fs::create_dir_all(&root).expect("score root should be created");
        let stage = root.join("stage.pdf");
        let stage_file = create_private_stage(&stage).expect("owned stage should be created");
        let expected = stage_identity(&stage_file).expect("owned stage identity should be captured");
        drop(stage_file);

        fs::remove_file(&stage).expect("owned stage should be removable for replacement fixture");
        fs::write(&stage, b"foreign replacement").expect("foreign replacement should be written");

        let error = remove_owned_stage(&stage, expected)
            .expect_err("cleanup must reject a replacement that is not the captured stage file");
        assert_eq!(error, SCORE_ATTACH_ERROR);
        assert_eq!(
            fs::read(&stage).expect("foreign replacement must survive failed cleanup"),
            b"foreign replacement"
        );
        let _ = fs::remove_dir_all(root);
    }
}
