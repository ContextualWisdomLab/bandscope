use crate::score_recovery;
use std::path::Path;

const SCORE_ATTACH_ERROR: &str = "Could not attach the score PDF.";

#[cfg(target_os = "macos")]
const SYNC_VOLUME_FULLSYNC: i32 = 0x01;
#[cfg(target_os = "macos")]
const SYNC_VOLUME_WAIT: i32 = 0x02;

#[cfg(target_os = "macos")]
extern "C" {
    fn fsync_volume_np(fd: i32, flags: i32) -> i32;
}

#[cfg(target_os = "macos")]
fn sync_successful_publication_metadata(scores_root: &Path) -> Result<(), String> {
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
fn sync_successful_publication_metadata(scores_root: &Path) -> Result<(), String> {
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
fn sync_successful_publication_metadata(_scores_root: &Path) -> Result<(), String> {
    // The lower Score Storage publisher already synchronizes the staged file
    // before creating the destination link. Windows directory-entry durability
    // still needs a separately verified native contract; do not fabricate one
    // by treating a file flush as a directory metadata barrier.
    Ok(())
}

#[cfg(all(not(unix), not(windows)))]
fn sync_successful_publication_metadata(_scores_root: &Path) -> Result<(), String> {
    Err(SCORE_ATTACH_ERROR.to_string())
}

/// Publish a score PDF and complete the supported-platform success durability
/// barrier before attachment success is returned to the application.
///
/// The underlying Score Storage owner still performs bounded copy, stage sync,
/// no-clobber hard-link publication, identity attestation and interrupted-write
/// recovery. This boundary adds the missing successful-return metadata barrier:
/// on macOS it performs a blocking full-volume sync using the app-owned scores
/// directory descriptor; on other Unix systems it synchronizes that directory.
/// If the barrier fails, publication is reported as failed and any already
/// published object remains recoverable through Score Storage inventory rather
/// than being guessed away.
///
/// Windows deliberately retains the existing staged-file synchronization until
/// a directory-metadata durability primitive is verified on the supported
/// packaged runtime. No Windows power-loss durability claim is made here.
///
/// Security Notes: the API exposes neither the selected source path nor the
/// workspace path in errors. It does not mutate Project Persistence metadata and
/// does not infer buyer intent from the existence of a published object.
pub fn publish_score_pdf_attachment(
    source: &Path,
    scores_root: &Path,
    score_id: &str,
) -> Result<u64, String> {
    let written = score_recovery::publish_score_pdf_attachment(source, scores_root, score_id)?;
    sync_successful_publication_metadata(scores_root)?;
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("bandscope-score-publication-{name}-{suffix}"))
    }

    #[test]
    fn public_publication_finishes_supported_success_barrier_before_return() {
        let root = unique_test_dir("success-durability");
        fs::create_dir_all(&root).expect("score root should be created");
        let source = root.join("selected.pdf");
        fs::write(&source, b"%PDF-1.7\ndurable-publication")
            .expect("score fixture should be written");

        let written = publish_score_pdf_attachment(&source, &root, SCORE_ID)
            .expect("publication should complete its supported durability barrier");

        assert_eq!(written, b"%PDF-1.7\ndurable-publication".len() as u64);
        assert_eq!(
            fs::read(root.join(format!("{SCORE_ID}.pdf")))
                .expect("published score should remain readable"),
            b"%PDF-1.7\ndurable-publication"
        );
        assert!(
            !root.join(format!(".score-{SCORE_ID}.stage")).exists(),
            "successful publication should retire its temporary stage"
        );
        let _ = fs::remove_dir_all(root);
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
