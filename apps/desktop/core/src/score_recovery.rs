use crate::{
    is_valid_score_id, resolve_existing_score_pdf, score_storage,
    score_storage::remove_score_pdf_attachment,
};
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
};

const SCORE_ATTACH_ERROR: &str = "Could not attach the score PDF.";
const SCORE_RECOVERY_ERROR: &str = "Could not recover the score workspace.";
const SCORE_WORKSPACE_LOCK: &str = ".score-storage.lock";

/// Cross-process lease for Score Storage mutation and recovery.
///
/// The lease file is intentionally persistent and contains no payload. Unix
/// uses a non-blocking exclusive `flock`; Windows opens the lock file with no
/// sharing. Both locks are released by the operating system when the process
/// exits, including abnormal termination. This lets a later BandScope process
/// distinguish an abandoned staging namespace from one owned by another live
/// writer running the same contract.
struct ScoreWorkspaceLease {
    _file: File,
    root: PathBuf,
}

#[cfg(unix)]
const LOCK_EX: i32 = 2;
#[cfg(unix)]
const LOCK_NB: i32 = 4;
#[cfg(any(target_os = "linux", target_os = "android"))]
const O_NOFOLLOW: i32 = 0x0002_0000;
#[cfg(all(unix, not(any(target_os = "linux", target_os = "android"))))]
const O_NOFOLLOW: i32 = 0x0000_0100;

#[cfg(unix)]
extern "C" {
    fn flock(fd: i32, operation: i32) -> i32;
}

#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

fn validate_scores_root(scores_root: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(scores_root).map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
    if !metadata.is_dir() {
        return Err(SCORE_RECOVERY_ERROR.to_string());
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(SCORE_RECOVERY_ERROR.to_string());
        }
    }

    Ok(())
}

#[cfg(unix)]
fn acquire_score_workspace_lease(scores_root: &Path) -> Result<ScoreWorkspaceLease, String> {
    use std::os::{fd::AsRawFd, unix::fs::OpenOptionsExt};

    validate_scores_root(scores_root)?;
    let lock_path = scores_root.join(SCORE_WORKSPACE_LOCK);
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .mode(0o600)
        .custom_flags(O_NOFOLLOW)
        .open(lock_path)
        .map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
    if !file
        .metadata()
        .map_err(|_| SCORE_RECOVERY_ERROR.to_string())?
        .is_file()
    {
        return Err(SCORE_RECOVERY_ERROR.to_string());
    }
    let result = unsafe { flock(file.as_raw_fd(), LOCK_EX | LOCK_NB) };
    if result != 0 {
        return Err(SCORE_RECOVERY_ERROR.to_string());
    }
    Ok(ScoreWorkspaceLease {
        _file: file,
        root: scores_root.to_path_buf(),
    })
}

#[cfg(windows)]
fn acquire_score_workspace_lease(scores_root: &Path) -> Result<ScoreWorkspaceLease, String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

    validate_scores_root(scores_root)?;
    let lock_path = scores_root.join(SCORE_WORKSPACE_LOCK);
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .create(true)
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options
        .open(lock_path)
        .map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
    if !metadata.is_file() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(SCORE_RECOVERY_ERROR.to_string());
    }
    Ok(ScoreWorkspaceLease {
        _file: file,
        root: scores_root.to_path_buf(),
    })
}

#[cfg(all(not(unix), not(windows)))]
fn acquire_score_workspace_lease(_scores_root: &Path) -> Result<ScoreWorkspaceLease, String> {
    Err(SCORE_RECOVERY_ERROR.to_string())
}

fn reserved_stage_score_id(name: &str) -> Option<&str> {
    let score_id = name.strip_prefix(".score-")?.strip_suffix(".stage")?;
    is_valid_score_id(score_id).then_some(score_id)
}

fn published_score_id(name: &str) -> Option<&str> {
    let score_id = name.strip_suffix(".pdf")?;
    is_valid_score_id(score_id).then_some(score_id)
}

fn recover_abandoned_score_stages(
    scores_root: &Path,
    lease: &ScoreWorkspaceLease,
) -> Result<usize, String> {
    if lease.root != scores_root {
        return Err(SCORE_RECOVERY_ERROR.to_string());
    }

    let mut removed = 0_usize;
    let entries = fs::read_dir(scores_root).map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(score_id) = reserved_stage_score_id(name) else {
            continue;
        };

        let stage = entry.path();
        let metadata = fs::symlink_metadata(&stage).map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
        if !metadata.is_file() {
            return Err(SCORE_RECOVERY_ERROR.to_string());
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(SCORE_RECOVERY_ERROR.to_string());
            }
        }

        // A destination beside its staging alias means interruption may have
        // happened after no-clobber publication. Score metadata persistence is
        // not yet transactionally coupled to this storage layer, so deleting
        // either pathname here could erase evidence or an attachment whose
        // lifecycle authority is not established. Preserve both and fail
        // closed; #1239 tracks that later lifecycle/recovery vertical.
        let destination = scores_root.join(format!("{score_id}.pdf"));
        match fs::symlink_metadata(&destination) {
            Ok(_) => return Err(SCORE_RECOVERY_ERROR.to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(SCORE_RECOVERY_ERROR.to_string()),
        }

        remove_score_pdf_attachment(&stage).map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
        removed += 1;
    }
    Ok(removed)
}

/// Return a deterministic inventory of safely published Score Storage objects.
///
/// The inventory is intentionally only byte/object truth. It does not claim
/// that a returned score id is referenced by durable project metadata, nor
/// whether an unreferenced object should be recovered or deleted. Project
/// Persistence owns that lifecycle decision. Before listing, the function
/// acquires the same cross-process lease as publication and performs the same
/// abandoned-stage recovery so a fresh process cannot report a workspace while
/// a current-contract writer is live or while stage-plus-destination state is
/// ambiguous.
///
/// Security Notes: only exact `<uuid>.pdf` names enter the owned object
/// inventory. Unrelated files are ignored rather than treated as Score Storage
/// objects. A matching owned name must resolve through the existing read-time
/// containment boundary as a regular contained non-symlink object; suspicious
/// matching entries and ambiguous publication state fail closed. No filesystem
/// path, filename from the selected source, or PDF payload is returned.
pub fn inventory_published_score_pdf_ids(scores_root: &Path) -> Result<Vec<String>, String> {
    let lease = acquire_score_workspace_lease(scores_root)?;
    recover_abandoned_score_stages(scores_root, &lease)?;

    let mut score_ids = Vec::new();
    let entries = fs::read_dir(scores_root).map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(score_id) = published_score_id(name) else {
            continue;
        };
        resolve_existing_score_pdf(scores_root, score_id)
            .map_err(|_| SCORE_RECOVERY_ERROR.to_string())?;
        score_ids.push(score_id.to_string());
    }
    score_ids.sort_unstable();
    Ok(score_ids)
}

/// Publish one score attachment after recovering process-abandoned staging.
///
/// The workspace lease spans recovery and the complete lower-level publication
/// so another BandScope process using this contract cannot have a live writer
/// mistaken for stale staging. A crash releases the OS lease automatically;
/// the next publication removes only reserved `.score-<uuid>.stage` regular
/// files for which no `<uuid>.pdf` destination exists, then proceeds through
/// the existing bounded/private/no-clobber Score Storage publisher.
///
/// Security Notes: malformed names are ignored because they are outside the
/// owned staging namespace. Reserved symlink/reparse/non-regular entries,
/// lock acquisition failure, unreadable directory state, or a stage with a
/// destination already present fail closed. Errors contain neither absolute
/// paths nor PDF bytes. This recovery closes abandoned *staging* from writers
/// using this lease contract; it does not claim lifecycle authority for a
/// destination created before an interruption or compatibility with an older
/// concurrently running BandScope build that never acquired the lease.
pub fn publish_score_pdf_attachment(
    source: &Path,
    scores_root: &Path,
    score_id: &str,
) -> Result<u64, String> {
    if !is_valid_score_id(score_id) {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    let lease = acquire_score_workspace_lease(scores_root)?;
    recover_abandoned_score_stages(scores_root, &lease)?;
    score_storage::publish_score_pdf_attachment(source, scores_root, score_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        process::Command,
        thread,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
    const LEASE_CHILD_ENV: &str = "BANDSCOPE_SCORE_LEASE_CHILD";
    const LEASE_ROOT_ENV: &str = "BANDSCOPE_SCORE_LEASE_ROOT";

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("bandscope-score-recovery-{name}-{suffix}"))
    }

    #[test]
    fn reserved_stage_name_requires_exact_score_uuid_shape() {
        assert_eq!(
            reserved_stage_score_id(".score-6fa459ea-ee8a-4ca4-894e-db77e160355e.stage"),
            Some(SCORE_ID)
        );
        assert_eq!(reserved_stage_score_id(".score-../escape.stage"), None);
        assert_eq!(reserved_stage_score_id("score-6fa459ea-ee8a-4ca4-894e-db77e160355e.stage"), None);
        assert_eq!(reserved_stage_score_id(".score-6fa459ea-ee8a-4ca4-894e-db77e160355e.tmp"), None);
    }

    #[test]
    fn published_score_name_requires_exact_score_uuid_shape() {
        assert_eq!(
            published_score_id("6fa459ea-ee8a-4ca4-894e-db77e160355e.pdf"),
            Some(SCORE_ID)
        );
        assert_eq!(published_score_id("notes.pdf"), None);
        assert_eq!(published_score_id("../escape.pdf"), None);
        assert_eq!(published_score_id("6fa459ea-ee8a-4ca4-894e-db77e160355e.PDF"), None);
    }

    #[test]
    fn workspace_lease_child() {
        if std::env::var_os(LEASE_CHILD_ENV).is_none() {
            return;
        }
        let root = PathBuf::from(
            std::env::var_os(LEASE_ROOT_ENV).expect("lease child root should be supplied"),
        );
        let _lease = acquire_score_workspace_lease(&root).expect("lease child should acquire lease");
        fs::write(root.join("lease-ready"), b"ready")
            .expect("lease child readiness marker should be written");
        loop {
            thread::sleep(Duration::from_secs(60));
        }
    }

    #[test]
    fn workspace_lease_rejects_a_live_process_and_releases_after_kill() {
        let root = unique_test_dir("lease-contention");
        fs::create_dir_all(&root).expect("score root should be created");
        let test_binary = std::env::current_exe().expect("unit test binary should resolve");
        let mut child = Command::new(test_binary)
            .arg("--exact")
            .arg("score_recovery::tests::workspace_lease_child")
            .arg("--nocapture")
            .env(LEASE_CHILD_ENV, "1")
            .env(LEASE_ROOT_ENV, &root)
            .spawn()
            .expect("lease child should start");

        let marker = root.join("lease-ready");
        let deadline = Instant::now() + Duration::from_secs(10);
        while !marker.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert!(marker.exists(), "child should hold the workspace lease");
        assert_eq!(
            acquire_score_workspace_lease(&root).err().as_deref(),
            Some(SCORE_RECOVERY_ERROR),
            "a second process must not enter recovery while the first writer is live"
        );

        child.kill().expect("lease child should terminate");
        let status = child.wait().expect("lease child should be reaped");
        assert!(!status.success(), "lease child should end by termination");
        acquire_score_workspace_lease(&root)
            .expect("the OS lease should become available after process termination");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recovery_removes_only_stage_without_destination() {
        let root = unique_test_dir("stage-only");
        fs::create_dir_all(&root).expect("score root should be created");
        let stage = root.join(format!(".score-{SCORE_ID}.stage"));
        fs::write(&stage, b"%PDF-1.7\nabandoned").expect("stage fixture should be written");
        let lease = acquire_score_workspace_lease(&root).expect("recovery should acquire lease");

        let removed = recover_abandoned_score_stages(&root, &lease)
            .expect("stage-only orphan should be recoverable");

        assert_eq!(removed, 1);
        assert!(!stage.exists());
        drop(lease);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recovery_preserves_ambiguous_stage_plus_destination() {
        let root = unique_test_dir("stage-and-destination");
        fs::create_dir_all(&root).expect("score root should be created");
        let stage = root.join(format!(".score-{SCORE_ID}.stage"));
        let destination = root.join(format!("{SCORE_ID}.pdf"));
        fs::write(&stage, b"%PDF-1.7\nstage").expect("stage fixture should be written");
        fs::write(&destination, b"%PDF-1.7\ndestination")
            .expect("destination fixture should be written");
        let lease = acquire_score_workspace_lease(&root).expect("recovery should acquire lease");

        let error = recover_abandoned_score_stages(&root, &lease)
            .expect_err("ambiguous published state must fail closed");

        assert_eq!(error, SCORE_RECOVERY_ERROR);
        assert!(stage.exists());
        assert!(destination.exists());
        drop(lease);
        let _ = fs::remove_dir_all(root);
    }
}
