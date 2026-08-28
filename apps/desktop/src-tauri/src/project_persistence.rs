use std::{
    ffi::OsString,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_PROJECT_FILE_BYTES: usize = 5 * 1024 * 1024;
const PROJECT_EXISTS_ERROR: &str = "Project file already exists. Choose a new file name.";
const PROJECT_STAGE_ERROR: &str = "Could not stage the project safely.";
const PROJECT_PUBLISH_ERROR: &str = "Could not publish the project safely.";
const PROJECT_READ_ERROR: &str = "Failed to read file";
const PROJECT_TOO_LARGE_ERROR: &str = "Project file is too large (exceeds 5MB limit)";

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
    let file_name = target
        .file_name()
        .ok_or_else(|| PROJECT_PUBLISH_ERROR.to_string())?;
    let mut stage_name = OsString::from(".");
    stage_name.push(file_name);
    stage_name.push(format!(".{}.stage", uuid::Uuid::new_v4()));
    Ok(parent.join(stage_name))
}

fn remove_stage(path: &Path) {
    let _ = fs::remove_file(path);
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
    options
        .read(true)
        .custom_flags(UNIX_PROJECT_OPEN_FLAGS);
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
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    left.file_attributes() == right.file_attributes()
        && left.creation_time() == right.creation_time()
        && left.last_write_time() == right.last_write_time()
        && left.file_size() == right.file_size()
}

#[cfg(not(any(unix, windows)))]
fn same_file_identity(_left: &fs::Metadata, _right: &fs::Metadata) -> bool {
    false
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

fn read_project_file_with_opener<F>(target: &Path, open_file: F) -> Result<String, String>
where
    F: FnOnce(&Path) -> std::io::Result<File>,
{
    let before = fs::symlink_metadata(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    if !metadata_is_regular_project_file(&before) {
        return Err(PROJECT_READ_ERROR.to_string());
    }

    let file = open_file(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    let opened = file.metadata().map_err(|_| PROJECT_READ_ERROR.to_string())?;
    let after = fs::symlink_metadata(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    if !metadata_is_regular_project_file(&opened)
        || !metadata_is_regular_project_file(&after)
        || !same_file_identity(&before, &opened)
        || !same_file_identity(&opened, &after)
    {
        return Err(PROJECT_READ_ERROR.to_string());
    }

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
/// handle acquisition and a special-file swap cannot block the UI thread. Windows opens the reparse
/// point itself rather than following it and rejects reparse handles, then requires stable file
/// metadata around acquisition. Other Unix targets fail closed until their no-follow flags are
/// explicitly modeled. The reader remains capped at `MAX_PROJECT_FILE_BYTES + 1`; backup, migration,
/// and recovery semantics remain later #962 work.
pub(crate) fn read_project_file(target: &Path) -> Result<String, String> {
    read_project_file_with_opener(target, open_project_file)
}

fn write_first_project_exclusively(target: &Path, content: &[u8]) -> Result<(), String> {
    let mut published = match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(PROJECT_EXISTS_ERROR.to_string());
        }
        Err(_) => return Err(PROJECT_PUBLISH_ERROR.to_string()),
    };

    if published.write_all(content).is_err() || published.sync_all().is_err() {
        // Do not remove `target` by path after publication begins: another actor could replace the
        // directory entry between this handle write and cleanup. There was no previous known-good
        // target in this fallback path, so fail without introducing a path-based delete race.
        return Err(PROJECT_PUBLISH_ERROR.to_string());
    }
    Ok(())
}

/// Publishes a selected project only after its complete bounded bytes are staged and synced.
///
/// The directly selected parent must itself be a real directory rather than a symlink/reparse point
/// before any staging artifact is created. `File::create_new` makes staging non-clobbering. A new
/// destination first uses a hard link to the synced staging inode, preserving no-clobber publication
/// where hard links are available. Filesystems without hard-link support fall back to an exclusive
/// `create_new` target and a second bounded write, which remains race-safe against another writer but
/// is not claimed to provide atomic first-save visibility. If the save dialog selected an existing
/// regular file, the synced staging file is atomically renamed over that directory entry;
/// symlink/reparse/special targets fail closed. Ancestor-handle binding, parent-directory durability,
/// concurrent-writer serialization, backup rotation, migration, and recovery remain separate
/// project-format work under #962.
pub(crate) fn publish_new_project_file(target: &Path, content: &[u8]) -> Result<(), String> {
    publish_new_project_file_with_linker(target, content, fs::hard_link)
}

pub(crate) fn publish_new_project_file_with_linker<F>(
    target: &Path,
    content: &[u8],
    link: F,
) -> Result<(), String>
where
    F: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if content.is_empty() || content.len() > MAX_PROJECT_FILE_BYTES {
        return Err(PROJECT_STAGE_ERROR.to_string());
    }

    let parent = project_parent(target);
    let parent_metadata =
        fs::symlink_metadata(parent).map_err(|_| PROJECT_STAGE_ERROR.to_string())?;
    if !metadata_is_safe_project_directory(&parent_metadata) {
        return Err(PROJECT_STAGE_ERROR.to_string());
    }

    let stage = staging_path(target)?;
    let mut staged = File::create_new(&stage).map_err(|_| PROJECT_STAGE_ERROR.to_string())?;
    if staged.write_all(content).is_err() || staged.sync_all().is_err() {
        drop(staged);
        remove_stage(&stage);
        return Err(PROJECT_STAGE_ERROR.to_string());
    }
    drop(staged);

    let existing_target = match fs::symlink_metadata(target) {
        Ok(metadata) => {
            if !metadata_is_regular_project_file(&metadata) {
                remove_stage(&stage);
                return Err(PROJECT_PUBLISH_ERROR.to_string());
            }
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => {
            remove_stage(&stage);
            return Err(PROJECT_PUBLISH_ERROR.to_string());
        }
    };

    if existing_target {
        if fs::rename(&stage, target).is_err() {
            remove_stage(&stage);
            return Err(PROJECT_PUBLISH_ERROR.to_string());
        }
        return Ok(());
    }

    if let Err(error) = link(&stage, target) {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            remove_stage(&stage);
            return Err(PROJECT_EXISTS_ERROR.to_string());
        }
        let fallback = write_first_project_exclusively(target, content);
        remove_stage(&stage);
        return fallback;
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
            .map(|entry| entry.expect("directory entry should be readable").file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);
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
        assert!(
            fs::symlink_metadata(&selected)
                .expect("selected symlink should remain")
                .file_type()
                .is_symlink()
        );
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn rejects_project_bytes_beyond_the_existing_load_limit_before_staging() {
        let root = test_dir("oversize");
        let target = root.join("setlist.bscope");
        let content = vec![b'x'; MAX_PROJECT_FILE_BYTES + 1];

        let error = publish_new_project_file(&target, &content)
            .expect_err("oversized project should fail before publication");

        assert_eq!(error, "Could not stage the project safely.");
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
        fs::write(&external, r#"{"id":"external"}"#)
            .expect("external fixture should be written");
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
        fs::write(&selected, r#"{"id":"selected"}"#)
            .expect("selected fixture should be written");
        fs::write(
            &replacement,
            r#"{"id":"replacement-with-different-bytes"}"#,
        )
        .expect("replacement fixture should be written");

        let error = read_project_file_with_opener(&selected, |path| {
            fs::rename(path, &parked)?;
            fs::rename(&replacement, path)?;
            fs::File::open(path)
        })
        .expect_err("a path replacement between preflight and open must fail closed");

        assert_eq!(error, "Failed to read file");
        fs::remove_dir_all(root).expect("test directory should be removable");
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
