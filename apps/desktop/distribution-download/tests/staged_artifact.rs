use bandscope_distribution_download::{
    ArtifactDownloadAdmission, StagedArtifactFile, StagingArtifactError,
};
use std::fs;
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

#[test]
fn cancelled_staging_file_is_removed_on_drop() {
    let directory = scratch_dir("cancel");
    let staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let path = staged.path().to_path_buf();
    assert!(path.is_file());

    drop(staged);

    assert!(!path.exists());
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn admitted_exact_artifact_can_be_sealed_and_retained() {
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

    assert!(path.is_file());
    fs::remove_file(path).expect("remove sealed fixture");
    fs::remove_dir(directory).expect("remove staging directory");
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
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn preexisting_destination_and_path_like_names_fail_closed() {
    let directory = scratch_dir("exclusive");
    fs::write(directory.join("update.bin"), b"existing").expect("write existing file");

    assert_eq!(
        StagedArtifactFile::create(&directory, "update.bin").unwrap_err(),
        StagingArtifactError::DestinationExists
    );
    assert_eq!(
        StagedArtifactFile::create(&directory, "../escape.bin").unwrap_err(),
        StagingArtifactError::InvalidArtifactName
    );

    fs::remove_file(directory.join("update.bin")).expect("remove existing file");
    fs::remove_dir(directory).expect("remove staging directory");
}
