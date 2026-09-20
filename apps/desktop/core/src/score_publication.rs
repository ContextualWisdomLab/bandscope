use std::path::Path;

const SCORE_ATTACH_ERROR: &str = "Could not attach the score PDF.";
const BEFORE_METADATA_BARRIER_CHECKPOINT: &str = "before-metadata-barrier";

#[cfg(feature = "score-storage-fault-injection")]
fn wait_at_fault_checkpoint(checkpoint: &str) {
    use std::{
        ffi::OsStr,
        fs::OpenOptions,
        io::Write,
        path::PathBuf,
        thread,
        time::Duration,
    };

    const CHECKPOINT_ENV: &str = "BANDSCOPE_SCORE_STORAGE_FAULT_CHECKPOINT";
    const MARKER_ENV: &str = "BANDSCOPE_SCORE_STORAGE_FAULT_MARKER";

    if std::env::var_os(CHECKPOINT_ENV).as_deref() != Some(OsStr::new(checkpoint)) {
        return;
    }

    let marker = PathBuf::from(
        std::env::var_os(MARKER_ENV).expect("fault-injection marker path should be supplied"),
    );
    let mut marker_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(marker)
        .expect("fault-injection marker should be created once");
    marker_file
        .write_all(checkpoint.as_bytes())
        .expect("fault-injection marker should be written");
    marker_file
        .sync_all()
        .expect("fault-injection marker should be synchronized");

    loop {
        thread::sleep(Duration::from_secs(60));
    }
}

#[cfg(not(feature = "score-storage-fault-injection"))]
fn wait_at_fault_checkpoint(_checkpoint: &str) {}

#[cfg(target_os = "macos")]
const SYNC_VOLUME_FULLSYNC: i32 = 0x01;
#[cfg(target_os = "macos")]
const SYNC_VOLUME_WAIT: i32 = 0x02;

#[cfg(target_os = "macos")]
extern "C" {
    fn fsync_volume_np(fd: i32, flags: i32) -> i32;
}

#[cfg(target_os = "macos")]
fn sync_successful_publication_metadata_platform(scores_root: &Path) -> Result<(), String> {
    use std::{fs::File, os::fd::AsRawFd};

    let directory = File::open(scores_root).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !directory
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?
        .is_dir()
    {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    // Darwin's volume sync API accepts a directory descriptor. FULLSYNC + WAIT
    // asks the filesystem and device to make the just-published directory
    // metadata durable before BandScope reports attachment success.
    let result = unsafe {
        fsync_volume_np(
            directory.as_raw_fd(),
            SYNC_VOLUME_FULLSYNC | SYNC_VOLUME_WAIT,
        )
    };
    if result != 0 {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn sync_successful_publication_metadata_platform(scores_root: &Path) -> Result<(), String> {
    use std::fs::File;

    let directory = File::open(scores_root).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !directory
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?
        .is_dir()
    {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    directory
        .sync_all()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())
}

#[cfg(windows)]
fn sync_successful_publication_metadata_platform(_scores_root: &Path) -> Result<(), String> {
    // The lower Score Storage publisher already synchronizes the staged file
    // before creating the destination link. Windows directory-entry durability
    // still needs a separately verified native contract; do not fabricate one
    // by treating a file flush as a directory metadata barrier.
    Ok(())
}

#[cfg(all(not(unix), not(windows)))]
fn sync_successful_publication_metadata_platform(_scores_root: &Path) -> Result<(), String> {
    Err(SCORE_ATTACH_ERROR.to_string())
}

/// Complete the successful-publication metadata durability barrier for the
/// supported platform while the Score Storage workspace lease is still held.
///
/// This function does not publish or remove any object. Its caller owns the
/// lifecycle transaction and must keep the Score Storage lease alive across the
/// lower-level publication and this barrier so another current-contract process
/// cannot mutate the workspace in between.
///
/// The optional `score-storage-fault-injection` feature exists only for the
/// owner-native process-termination regression. When that feature and its exact
/// checkpoint environment are both present, execution pauses immediately before
/// the platform barrier so a parent test process can terminate the real public
/// publisher while the workspace lease is still held. Default product builds do
/// not include an active checkpoint path.
pub(crate) fn sync_successful_publication_metadata(scores_root: &Path) -> Result<(), String> {
    wait_at_fault_checkpoint(BEFORE_METADATA_BARRIER_CHECKPOINT);
    sync_successful_publication_metadata_platform(scores_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("bandscope-score-publication-{name}-{suffix}"))
    }

    #[cfg(unix)]
    #[test]
    fn metadata_barrier_rejects_a_non_directory_authority() {
        let root = unique_test_dir("non-directory");
        fs::write(&root, b"not-a-directory").expect("fixture should be written");

        let error = sync_successful_publication_metadata(&root)
            .expect_err("a file cannot stand in for the score workspace directory");

        assert_eq!(error, SCORE_ATTACH_ERROR);
        let _ = fs::remove_file(root);
    }
}
