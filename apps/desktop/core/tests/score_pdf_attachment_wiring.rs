const TAURI_MAIN: &str = include_str!("../../src-tauri/src/main.rs");

#[test]
fn tauri_attachment_command_uses_score_storage_publication_boundary() {
    let attach_start = TAURI_MAIN
        .find("fn attach_score_pdf(")
        .expect("attach_score_pdf command should exist");
    let read_start = TAURI_MAIN[attach_start..]
        .find("fn read_score_pdf(")
        .map(|offset| attach_start + offset)
        .expect("read_score_pdf command should follow attachment command");
    let attach_source = &TAURI_MAIN[attach_start..read_start];

    assert!(attach_source.contains("publish_score_pdf_attachment("));
    assert!(!attach_source.contains("std::fs::copy("));
}
