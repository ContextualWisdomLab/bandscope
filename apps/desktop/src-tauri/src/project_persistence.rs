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

fn staging_path(target: &Path) -> Result<PathBuf, String> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target.file_name().ok_or_else(|| PROJECT_PUBLISH_ERROR.to_string())?;
    let mut stage_name = OsString::from(".");
    stage_name.push(file_name);
    stage_name.push(format!(".{}.stage", uuid::Uuid::new_v4()));
    Ok(parent.join(stage_name))
}

fn remove_stage(path: &Path) {
    let _ = fs::remove_file(path);
}

fn read_project_file_with_opener<F>(target: &Path, open_file: F) -> Result<String, String>
where
    F: FnOnce(&Path) -> std::io::Result<File>,
{
    let metadata = fs::symlink_metadata(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(PROJECT_READ_ERROR.to_string());
    }

    let file = open_file(target).map_err(|_| PROJECT_READ_ERROR.to_string())?;
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

/// Reads one project through the same bounded byte ceiling used by project publication.
///
/// A directly selected symlink is rejected before it can redirect the read to different content.
/// The regular file is then opened once and the reader itself is capped at
/// `MAX_PROJECT_FILE_BYTES + 1`, so a file that grows after selection cannot turn a metadata
/// preflight into an unbounded allocation. UTF-8 decoding happens only after the bounded read
/// completes. Handle-level identity checks for a path swapped between inspection and open remain a
/// later #962 boundary and are not claimed by this helper.
pub(crate) fn read_project_file(target: &Path) -> Result<String, String> {
    read_project_file_with_opener(target, File::open)
}

/// Publishes one new project only after its complete bounded bytes are staged and synced.
///
/// This helper deliberately does not implement overwrite semantics. `File::create_new` makes the
/// staging name non-clobbering, and `hard_link` atomically creates the user-selected destination
/// only if that destination is still absent. An existing file or dangling symlink therefore stays
/// untouched instead of being truncated before replacement bytes are durable. Crash-safe overwrite,
/// backup rotation, migration, and recovery remain separate project-format work under #962.
pub(crate) fn publish_new_project_file(target: &Path, content: &[u8]) -> Result<(), String> {
    if content.is_empty() || content.len() > MAX_PROJECT_FILE_BYTES {
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

    if let Err(error) = fs::hard_link(&stage, target) {
        remove_stage(&stage);
        return if error.kind() == std::io::ErrorKind::AlreadyExists {
            Err(PROJECT_EXISTS_ERROR.to_string())
        } else {
            Err(PROJECT_PUBLISH_ERROR.to_string())
        };
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

        assert_eq!(fs::read(&target).expect("published project should be readable"), content);
        let names = fs::read_dir(&root)
            .expect("test directory should be readable")
            .map(|entry| entry.expect("directory entry should be readable").file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn refuses_to_clobber_an_existing_known_good_project() {
        let root = test_dir("existing");
        let target = root.join("setlist.bscope");
        let known_good = br#"{\"id\":\"known-good\"}"#;
        fs::write(&target, known_good).expect("fixture should be written");

        let error = publish_new_project_file(&target, br#"{\"id\":\"replacement\"}"#)
            .expect_err("existing project must not be overwritten unsafely");

        assert_eq!(error, "Project file already exists. Choose a new file name.");
        assert_eq!(fs::read(&target).expect("known-good project should remain"), known_good);
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
        assert_eq!(fs::read_dir(&root).expect("directory should be readable").count(), 0);
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
            "the Tauri save command must use the staged non-clobbering publisher"
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
