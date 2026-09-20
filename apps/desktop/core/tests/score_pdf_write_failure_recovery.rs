#[cfg(unix)]
use bandscope_desktop_core::{
    inventory_published_score_pdf_receipts, publish_score_pdf_attachment,
};
#[cfg(unix)]
use std::{
    env, fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(unix)]
const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
#[cfg(unix)]
const WRITE_FAILURE_CHILD_ENV: &str = "BANDSCOPE_SCORE_WRITE_FAILURE_CHILD";
#[cfg(unix)]
const WRITE_FAILURE_ROOT_ENV: &str = "BANDSCOPE_SCORE_WRITE_FAILURE_ROOT";
#[cfg(unix)]
const WRITE_FAILURE_SOURCE_ENV: &str = "BANDSCOPE_SCORE_WRITE_FAILURE_SOURCE";
#[cfg(unix)]
const SOURCE_BYTES: usize = 128 * 1024;

#[cfg(unix)]
fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    env::temp_dir().join(format!("bandscope-score-write-failure-{name}-{suffix}"))
}

#[cfg(unix)]
fn score_fixture() -> Vec<u8> {
    let mut bytes = vec![b'x'; SOURCE_BYTES];
    bytes[..9].copy_from_slice(b"%PDF-1.7\n");
    bytes
}

#[cfg(unix)]
#[test]
fn kernel_file_size_limit_child() {
    if env::var_os(WRITE_FAILURE_CHILD_ENV).is_none() {
        return;
    }

    let root = PathBuf::from(
        env::var_os(WRITE_FAILURE_ROOT_ENV).expect("write-failure child root should be supplied"),
    );
    let source = PathBuf::from(
        env::var_os(WRITE_FAILURE_SOURCE_ENV)
            .expect("write-failure child source should be supplied"),
    );

    let error = publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect_err("the kernel-enforced file-size limit must make stage publication fail");

    assert_eq!(error, "Could not attach the score PDF.");
}

#[cfg(unix)]
#[test]
fn kernel_write_failure_does_not_publish_or_leave_stage_authority() {
    let root = unique_test_dir("rlimit-fsize");
    fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    fs::write(&source, score_fixture()).expect("full-size write-failure source should be written");

    let current_test_binary = env::current_exe().expect("current test binary should resolve");
    let status = Command::new("sh")
        .arg("-c")
        .arg("ulimit -f 1; trap '' 25; exec \"$1\" --exact kernel_file_size_limit_child --nocapture")
        .arg("bandscope-score-write-failure")
        .arg(&current_test_binary)
        .env(WRITE_FAILURE_CHILD_ENV, "1")
        .env(WRITE_FAILURE_ROOT_ENV, &root)
        .env(WRITE_FAILURE_SOURCE_ENV, &source)
        .status()
        .expect("write-failure child process should launch");

    assert!(
        status.success(),
        "child must observe a handled write failure instead of crashing or reporting success"
    );

    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    assert!(
        !destination.exists(),
        "a kernel write failure before stage sync must not create published score truth"
    );
    assert!(
        !stage.exists(),
        "the failed writer must retire only its owned partial stage before returning"
    );
    assert_eq!(
        fs::metadata(&source)
            .expect("source should remain intact after failed publication")
            .len(),
        SOURCE_BYTES as u64,
        "fault injection must not shrink the product source or production size ceiling"
    );

    let receipts = inventory_published_score_pdf_receipts(&root)
        .expect("fresh restart inventory should accept the cleaned workspace");
    assert!(
        receipts.is_empty(),
        "write failure must not become a published recovery candidate"
    );

    let _ = fs::remove_dir_all(root);
}
