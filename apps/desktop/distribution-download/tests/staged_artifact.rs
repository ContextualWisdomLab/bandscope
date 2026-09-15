use bandscope_distribution_download::{
    ArtifactDownloadAdmission, StagedArtifactFile, StagingArtifactError,
};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

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

fn remove_scratch_dir(directory: &Path) {
    let lease_path = directory.join(".bandscope-staging.lock");
    match fs::remove_file(&lease_path) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => panic!("remove staging lease fixture: {error}"),
    }
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn cancelled_staging_file_is_removed_on_drop() {
    let directory = scratch_dir("cancel");
    let staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let path = staged.path().to_path_buf();
    assert!(path.is_file());

    drop(staged);

    assert!(!path.exists());
    remove_scratch_dir(&directory);
}

#[test]
fn sealed_but_unverified_artifact_is_removed_on_drop() {
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

    assert!(!path.exists());
    remove_scratch_dir(&directory);
}

#[test]
fn failed_admission_removes_partial_staging_file() {
    let directory = scratch_dir("overrun");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let path = staged.path().to_path_buf();
    let mut admission = ArtifactDownloadAdmission::new(4, None).expect("admission");
    staged
        .admit_chunk(&mut admission, b"abc")
        .expect("bounded first chunk");
    assert!(staged.admit_chunk(&mut admission, b"de").is_err());

    drop(staged);

    assert!(!path.exists());
    remove_scratch_dir(&directory);
}

#[test]
fn receipt_size_mismatch_removes_unsealed_staging_file() {
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
    assert!(!path.exists());
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
    assert!(!path.exists());
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
    assert!(!path.exists());

    let replacement = StagedArtifactFile::create(&directory, "update.bin")
        .expect("released active attempt must allow a fresh retry");
    drop(replacement);
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