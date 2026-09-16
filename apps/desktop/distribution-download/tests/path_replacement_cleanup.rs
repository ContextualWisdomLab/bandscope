#![cfg(any(unix, windows))]

use bandscope_distribution_download::{ArtifactDownloadAdmission, StagedArtifactFile};
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
        "bandscope-distribution-download-path-replacement-{label}-{}-{nonce}",
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

fn cleanup(directory: &Path, paths: &[&Path]) {
    for path in paths {
        remove_file_if_present(path);
    }
    remove_file_if_present(&directory.join(".bandscope-staging.lock"));
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn cancelled_attempt_does_not_delete_replacement_path() {
    let directory = scratch_dir("cancelled");
    let staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let original_path = staged.path().to_path_buf();
    let moved_original = directory.join("moved-original.bin");

    fs::rename(&original_path, &moved_original).expect("move owned staging file away");
    fs::write(&original_path, b"replacement-must-survive").expect("create unrelated replacement");

    drop(staged);

    assert_eq!(
        fs::read(&original_path).expect("replacement pathname must not be deleted"),
        b"replacement-must-survive"
    );
    cleanup(&directory, &[&original_path, &moved_original]);
}

#[test]
fn sealed_attempt_does_not_delete_replacement_path() {
    let directory = scratch_dir("sealed");
    let mut staged = StagedArtifactFile::create(&directory, "update.bin").expect("stage file");
    let mut admission = ArtifactDownloadAdmission::new(4, Some(4)).expect("admission");
    staged
        .admit_chunk(&mut admission, b"data")
        .expect("write admitted bytes");
    let receipt = admission.finish().expect("exact receipt");
    let sealed = staged.seal(receipt).expect("seal exact artifact");
    let original_path = sealed.path().to_path_buf();
    let moved_original = directory.join("moved-sealed-original.bin");

    fs::rename(&original_path, &moved_original).expect("move sealed staging file away");
    fs::write(&original_path, b"replacement-must-survive").expect("create unrelated replacement");

    drop(sealed);

    assert_eq!(
        fs::read(&original_path).expect("replacement pathname must not be deleted"),
        b"replacement-must-survive"
    );
    cleanup(&directory, &[&original_path, &moved_original]);
}

#[cfg(windows)]
#[test]
fn deferred_windows_stale_file_is_reclaimed_by_next_leased_attempt() {
    let directory = scratch_dir("windows-deferred-reclaim");
    let staged = StagedArtifactFile::create(&directory, "update.bin").expect("first stage file");
    let path = staged.path().to_path_buf();

    drop(staged);
    assert!(
        path.is_file(),
        "Windows drop leaves scratch bytes when pathname ownership cannot be proven"
    );

    let next = StagedArtifactFile::create(&directory, "update.bin")
        .expect("next leased attempt reclaims stale regular scratch");
    assert_eq!(next.path(), path);
    drop(next);

    cleanup(&directory, &[&path]);
}
