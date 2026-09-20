use bandscope_desktop_core::{
    publish_score_pdf_attachment, read_validated_score_pdf, resolve_existing_score_pdf,
};
use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const CHILD_ENV: &str = "BANDSCOPE_SCORE_RESTART_READBACK_CHILD";
const ROOT_ENV: &str = "BANDSCOPE_SCORE_RESTART_READBACK_ROOT";
const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const PDF_BYTES: &[u8] = b"%PDF-restart-readback";

fn unique_test_dir() -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-score-restart-readback-{suffix}"))
}

fn child_readback() {
    let root = PathBuf::from(
        std::env::var_os(ROOT_ENV).expect("restart child should receive the score workspace"),
    );
    let path = resolve_existing_score_pdf(&root, SCORE_ID)
        .expect("restart child should resolve the published score inside the workspace");
    let bytes = read_validated_score_pdf(&path)
        .expect("restart child should read the published score through the bounded native reader");
    assert_eq!(bytes, PDF_BYTES);
}

#[test]
fn published_score_reads_back_in_fresh_process() {
    if std::env::var_os(CHILD_ENV).is_some() {
        child_readback();
        return;
    }

    let root = unique_test_dir();
    fs::create_dir_all(&root).expect("score workspace should be created");
    let source = root.join("selected.pdf");
    fs::write(&source, PDF_BYTES).expect("score fixture should be written");

    let written = publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect("score publication should succeed before restart");
    assert_eq!(written, PDF_BYTES.len() as u64);

    let status = Command::new(std::env::current_exe().expect("test binary path should resolve"))
        .arg("--exact")
        .arg("published_score_reads_back_in_fresh_process")
        .arg("--nocapture")
        .env(CHILD_ENV, "1")
        .env(ROOT_ENV, &root)
        .status()
        .expect("restart child should launch");
    assert!(status.success(), "restart readback child must succeed");

    let stale_stage_count = fs::read_dir(&root)
        .expect("score workspace should remain readable")
        .filter_map(Result::ok)
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            name.starts_with(".score-") && name.ends_with(".stage")
        })
        .count();
    assert_eq!(
        stale_stage_count, 0,
        "successful publication must not leave a staging alias across restart"
    );

    fs::remove_dir_all(root).expect("restart/readback fixture should be removable");
}
