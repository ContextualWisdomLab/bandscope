//! Regression tests for bounded score-PDF reads at the native trust boundary.

use bandscope_desktop_core::{read_score_pdf_bytes, MAX_SCORE_PDF_BYTES};
use std::fs;
use uuid::Uuid;

fn temp_root() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("bandscope-score-read-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).expect("score read test root should be created");
    root
}

#[test]
fn reads_valid_pdf_bytes() {
    let root = temp_root();
    let path = root.join("score.pdf");
    let expected = b"%PDF-1.7 bounded body";
    fs::write(&path, expected).expect("valid score should be written");

    let bytes = read_score_pdf_bytes(&path).expect("valid score should be readable");

    assert_eq!(bytes, expected);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn rejects_empty_short_wrong_magic_and_oversized_score_reads() {
    let root = temp_root();

    let empty = root.join("empty.pdf");
    fs::write(&empty, b"").expect("empty score should be written");
    assert!(read_score_pdf_bytes(&empty).is_err());

    let short = root.join("short.pdf");
    fs::write(&short, b"%PD").expect("short score should be written");
    assert!(read_score_pdf_bytes(&short).is_err());

    let wrong_magic = root.join("wrong.pdf");
    fs::write(&wrong_magic, b"PK\x03\x04 not a pdf").expect("wrong-magic score should be written");
    assert!(read_score_pdf_bytes(&wrong_magic).is_err());

    let oversized = root.join("oversized.pdf");
    fs::write(&oversized, b"%PDF-").expect("oversized score header should be written");
    fs::OpenOptions::new()
        .write(true)
        .open(&oversized)
        .expect("oversized score should reopen")
        .set_len(MAX_SCORE_PDF_BYTES + 1)
        .expect("oversized score should be extended sparsely");
    assert!(read_score_pdf_bytes(&oversized).is_err());

    let _ = fs::remove_dir_all(root);
}
