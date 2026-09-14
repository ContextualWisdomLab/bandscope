use bandscope_distribution_download::{ArtifactDownloadAdmission, StagedArtifactFile};
use std::fs;
use std::io::Read;
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
