use bandscope_distribution_download::{ArtifactDownloadAdmission, StagedArtifactFile};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Read, Write};
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
fn sealed_artifact_exposes_descriptor_bound_read_only_stream() {
    let directory = scratch_dir("sealed-reader");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let staged_path = staged.path().to_path_buf();
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    staged
        .admit_chunk(&mut admission, b"data")
        .expect("write admitted bytes");
    let receipt = admission.finish().expect("exact response receipt");
    let sealed = staged.seal(receipt).expect("sync and seal exact artifact");

    let mut reader = sealed.reader();
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .expect("read exact sealed descriptor bytes");
    assert_eq!(bytes, b"data");
    assert_eq!(sealed.bytes_written(), 4);

    drop(reader);
    drop(sealed);
    assert!(!staged_path.exists());
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn sealed_reader_never_crosses_the_admitted_byte_boundary_after_external_growth() {
    let directory = scratch_dir("sealed-reader-growth");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let staged_path = staged.path().to_path_buf();
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    staged
        .admit_chunk(&mut admission, b"data")
        .expect("write admitted bytes");
    let receipt = admission.finish().expect("exact response receipt");
    let sealed = staged.seal(receipt).expect("sync and seal exact artifact");

    let mut external = OpenOptions::new()
        .append(true)
        .open(&staged_path)
        .expect("simulate post-seal local growth");
    external
        .write_all(b"untrusted-tail")
        .expect("append hostile tail");
    external.sync_all().expect("persist hostile tail");
    drop(external);

    let mut reader = sealed.reader();
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .expect("reader remains bounded to admitted bytes");
    assert_eq!(bytes, b"data");
    assert_eq!(sealed.bytes_written(), 4);

    drop(reader);
    drop(sealed);
    assert!(!staged_path.exists());
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn sealed_reader_fails_closed_when_the_admitted_descriptor_is_truncated() {
    let directory = scratch_dir("sealed-reader-truncate");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let staged_path = staged.path().to_path_buf();
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    staged
        .admit_chunk(&mut admission, b"data")
        .expect("write admitted bytes");
    let receipt = admission.finish().expect("exact response receipt");
    let sealed = staged.seal(receipt).expect("sync and seal exact artifact");

    let external = OpenOptions::new()
        .write(true)
        .open(&staged_path)
        .expect("simulate post-seal local truncation");
    external.set_len(2).expect("truncate hostile artifact");
    external.sync_all().expect("persist truncation");
    drop(external);

    let mut reader = sealed.reader();
    let mut bytes = Vec::new();
    let error = reader
        .read_to_end(&mut bytes)
        .expect_err("truncation below admitted boundary must fail closed");
    assert_eq!(error.kind(), ErrorKind::UnexpectedEof);
    assert_eq!(bytes, b"da");

    drop(reader);
    drop(sealed);
    assert!(!staged_path.exists());
    fs::remove_dir(directory).expect("remove staging directory");
}
