use bandscope_distribution_download::{
    ArtifactDownloadAdmission, StagedArtifactFile, StagingArtifactError,
};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CHILD_STAGING_DIRECTORY_ENV: &str = "BANDSCOPE_TEST_STAGING_DIRECTORY";
const CHILD_READY_PATH_ENV: &str = "BANDSCOPE_TEST_STAGING_READY";
const CHILD_RELEASE_PATH_ENV: &str = "BANDSCOPE_TEST_STAGING_RELEASE";

fn scratch_dir(label: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after unix epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "bandscope-distribution-download-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&path).expect("create isolated staging directory");
    path
}

fn remove_file_if_present(path: &Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => panic!("remove fixture {}: {error}", path.display()),
    }
}

fn remove_scratch_dir(directory: &Path) {
    remove_file_if_present(&directory.join("update.bin"));
    remove_file_if_present(&directory.join(".bandscope-staging.lock"));
    fs::remove_dir(directory).expect("remove staging directory");
}

fn assert_platform_drop_cleanup(path: &Path) {
    #[cfg(unix)]
    assert!(!path.exists(), "Unix removes the descriptor-owned staging path");

    #[cfg(not(unix))]
    assert!(
        path.is_file(),
        "non-Unix drop defers pathname deletion when descriptor identity cannot be proven"
    );
}

fn wait_for_path(path: &Path, label: &str) {
    for _ in 0..1_000 {
        if path.exists() {
            return;
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!("timed out waiting for {label}: {}", path.display());
}

#[test]
fn cancelled_staging_file_follows_platform_cleanup_contract() {
    let directory = scratch_dir("cancel");
    let staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let path = staged.path().to_path_buf();
    assert!(path.is_file());

    drop(staged);

    assert_platform_drop_cleanup(&path);
    remove_scratch_dir(&directory);
}

#[test]
fn sealed_but_unverified_artifact_follows_platform_cleanup_contract() {
    let directory = scratch_dir("seal");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    staged
        .admit_chunk(&mut admission, b"data")
        .expect("write admitted bytes");
    let receipt = admission.finish().expect("exact response receipt");

    let sealed = staged.seal(receipt).expect("sync and seal exact artifact");
    assert_eq!(sealed.bytes_written(), 4);
    assert_eq!(fs::metadata(sealed.path()).expect("sealed metadata").len(), 4);
    let path = sealed.path().to_path_buf();
    drop(sealed);

    assert_platform_drop_cleanup(&path);
    remove_scratch_dir(&directory);
}

#[test]
fn sealed_unverified_artifact_keeps_staging_lease() {
    let directory = scratch_dir("sealed-lease");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    staged
        .admit_chunk(&mut admission, b"data")
        .expect("write admitted bytes");
    let receipt = admission.finish().expect("exact response receipt");
    let sealed = staged.seal(receipt).expect("seal artifact");

    assert_eq!(
        StagedArtifactFile::create(&directory, "update.bin").unwrap_err(),
        StagingArtifactError::ConcurrentAttempt
    );
    assert!(sealed.path().is_file());

    drop(sealed);
    let replacement = StagedArtifactFile::create(&directory, "update.bin")
        .expect("lease must release and stale scratch must be reclaimable");
    drop(replacement);
    remove_scratch_dir(&directory);
}

#[test]
fn failed_admission_follows_platform_cleanup_contract() {
    let directory = scratch_dir("overrun");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let path = staged.path().to_path_buf();
    let mut admission = ArtifactDownloadAdmission::new(4, None).expect("admission");
    staged
        .admit_chunk(&mut admission, b"abc")
        .expect("bounded first chunk");
    assert!(staged.admit_chunk(&mut admission, b"de").is_err());

    drop(staged);

    assert_platform_drop_cleanup(&path);
    remove_scratch_dir(&directory);
}

#[test]
fn receipt_size_mismatch_follows_platform_cleanup_contract() {
    let directory = scratch_dir("receipt-mismatch");
    let staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let path = staged.path().to_path_buf();
    let mut unrelated_sink = Vec::new();
    let mut unrelated_admission = ArtifactDownloadAdmission::new(1, Some(1)).expect("admission");
    unrelated_admission
        .write_chunk(&mut unrelated_sink, b"x")
        .expect("write unrelated receipt fixture");
    let receipt = unrelated_admission.finish().expect("receipt");

    assert_eq!(staged.seal(receipt).unwrap_err(), StagingArtifactError::SizeMismatch);
    assert_platform_drop_cleanup(&path);
    remove_scratch_dir(&directory);
}

#[test]
fn stale_regular_destination_is_reclaimed_before_new_attempt() {
    let directory = scratch_dir("stale-restart");
    let path = directory.join("update.bin");
    fs::write(&path, b"partial-from-crashed-process").expect("write stale partial artifact");

    let staged = StagedArtifactFile::create(&directory, "update.bin")
        .expect("restart should reclaim stale unverified regular file");

    assert_eq!(fs::metadata(&path).expect("replacement metadata").len(), 0);
    drop(staged);
    assert_platform_drop_cleanup(&path);
    remove_scratch_dir(&directory);
}

#[test]
fn active_staging_attempt_is_not_reclaimed_as_stale() {
    let directory = scratch_dir("active-attempt");
    let path = directory.join("update.bin");
    let mut first = StagedArtifactFile::create(&directory, "update.bin").expect("first attempt");
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    first
        .admit_chunk(&mut admission, b"da")
        .expect("write partial active attempt");

    assert_eq!(
        StagedArtifactFile::create(&directory, "update.bin").unwrap_err(),
        StagingArtifactError::ConcurrentAttempt
    );
    assert!(path.exists());

    drop(first);
    assert_platform_drop_cleanup(&path);

    let replacement = StagedArtifactFile::create(&directory, "update.bin")
        .expect("released active attempt must allow a fresh retry");
    drop(replacement);
    remove_scratch_dir(&directory);
}

#[test]
fn staging_lease_child_holds_until_release() {
    let Ok(directory) = std::env::var(CHILD_STAGING_DIRECTORY_ENV) else {
        return;
    };
    let ready_path = std::env::var(CHILD_READY_PATH_ENV).expect("child ready path");
    let release_path = std::env::var(CHILD_RELEASE_PATH_ENV).expect("child release path");
    let staged = StagedArtifactFile::create(Path::new(&directory), "update.bin")
        .expect("child staging attempt");
    fs::write(&ready_path, b"ready").expect("publish child readiness");
    wait_for_path(Path::new(&release_path), "parent release signal");
    drop(staged);
}

#[test]
fn separate_process_cannot_reclaim_live_staging_attempt() {
    let directory = scratch_dir("separate-process");
    let ready_path = directory.join("child.ready");
    let release_path = directory.join("child.release");
    let test_binary = std::env::current_exe().expect("current integration test binary");
    let mut child = Command::new(test_binary)
        .arg("--exact")
        .arg("staging_lease_child_holds_until_release")
        .arg("--nocapture")
        .env(CHILD_STAGING_DIRECTORY_ENV, &directory)
        .env(CHILD_READY_PATH_ENV, &ready_path)
        .env(CHILD_RELEASE_PATH_ENV, &release_path)
        .spawn()
        .expect("spawn staging lease child process");

    wait_for_path(&ready_path, "child staging readiness");
    assert_eq!(
        StagedArtifactFile::create(&directory, "update.bin").unwrap_err(),
        StagingArtifactError::ConcurrentAttempt
    );
    assert!(directory.join("update.bin").is_file());

    fs::write(&release_path, b"release").expect("release child staging lease");
    let status = child.wait().expect("wait for staging lease child");
    assert!(status.success());
    let staging_path = directory.join("update.bin");
    assert_platform_drop_cleanup(&staging_path);

    let replacement = StagedArtifactFile::create(&directory, "update.bin")
        .expect("fresh attempt after child process release");
    drop(replacement);
    fs::remove_file(ready_path).expect("remove child readiness fixture");
    fs::remove_file(release_path).expect("remove child release fixture");
    remove_scratch_dir(&directory);
}

#[test]
fn path_like_artifact_names_fail_closed() {
    let directory = scratch_dir("path-like-name");

    assert_eq!(
        StagedArtifactFile::create(&directory, "../escape.bin").unwrap_err(),
        StagingArtifactError::InvalidArtifactName
    );

    remove_scratch_dir(&directory);
}

#[test]
fn unavailable_or_non_directory_staging_roots_fail_closed() {
    let directory = scratch_dir("invalid-root");
    let missing = directory.join("missing");
    let regular_file = directory.join("regular-file");
    fs::write(&regular_file, b"not a directory").expect("write regular fixture");

    assert_eq!(
        StagedArtifactFile::create(&missing, "update.bin").unwrap_err(),
        StagingArtifactError::StagingDirectoryUnavailable(ErrorKind::NotFound)
    );
    assert_eq!(
        StagedArtifactFile::create(&regular_file, "update.bin").unwrap_err(),
        StagingArtifactError::InvalidStagingDirectory
    );

    fs::remove_file(regular_file).expect("remove regular fixture");
    remove_scratch_dir(&directory);
}

#[cfg(unix)]
#[test]
fn symlink_staging_root_is_rejected() {
    use std::os::unix::fs::symlink;

    let directory = scratch_dir("symlink-root");
    let target = directory.join("real");
    let link = directory.join("link");
    fs::create_dir(&target).expect("create target directory");
    symlink(&target, &link).expect("create directory symlink");

    assert_eq!(
        StagedArtifactFile::create(&link, "update.bin").unwrap_err(),
        StagingArtifactError::InvalidStagingDirectory
    );

    fs::remove_file(link).expect("remove symlink");
    fs::remove_dir(target).expect("remove target directory");
    remove_scratch_dir(&directory);
}

#[cfg(unix)]
#[test]
fn symlink_staging_lease_is_not_followed() {
    use std::os::unix::fs::symlink;

    let directory = scratch_dir("symlink-lease");
    let target = directory.join("outside.lock");
    let lease = directory.join(".bandscope-staging.lock");
    fs::write(&target, b"must-not-be-used-as-lock").expect("write lease target fixture");
    symlink(&target, &lease).expect("create lease symlink");

    assert_eq!(
        StagedArtifactFile::create(&directory, "update.bin").unwrap_err(),
        StagingArtifactError::DestinationExists
    );
    assert_eq!(
        fs::read(&target).expect("read lease target fixture"),
        b"must-not-be-used-as-lock"
    );

    fs::remove_file(lease).expect("remove lease symlink");
    fs::remove_file(target).expect("remove lease target fixture");
    fs::remove_dir(directory).expect("remove staging directory");
}

#[cfg(unix)]
#[test]
fn symlink_destination_is_not_reclaimed_as_stale_regular_file() {
    use std::os::unix::fs::symlink;

    let directory = scratch_dir("symlink-destination");
    let target = directory.join("outside.bin");
    let link = directory.join("update.bin");
    fs::write(&target, b"must-not-be-touched").expect("write target fixture");
    symlink(&target, &link).expect("create destination symlink");

    assert_eq!(
        StagedArtifactFile::create(&directory, "update.bin").unwrap_err(),
        StagingArtifactError::DestinationExists
    );
    assert_eq!(fs::read(&target).expect("read target fixture"), b"must-not-be-touched");

    fs::remove_file(link).expect("remove destination symlink");
    fs::remove_file(target).expect("remove target fixture");
    remove_scratch_dir(&directory);
}
