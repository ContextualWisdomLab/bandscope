const TAURI_MAIN: &str = include_str!("../../src-tauri/src/main.rs");
const TAURI_BUILD: &str = include_str!("../../src-tauri/build.rs");
const TAURI_CAPABILITY: &str = include_str!("../../src-tauri/capabilities/main.json");
const SCORE_STORAGE_BRIDGE: &str = include_str!("../../src/features/score/scoreStorage.ts");
const SCORE_VIEW: &str = include_str!("../../src/features/score/ScoreView.tsx");

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

#[test]
fn tauri_remove_command_requires_a_fresh_content_receipt() {
    let receipt_start = TAURI_MAIN
        .find("fn get_score_pdf_receipt(")
        .expect("get_score_pdf_receipt command should expose path-free object freshness");
    let remove_start = TAURI_MAIN[receipt_start..]
        .find("fn remove_score_pdf_if_receipt_matches(")
        .map(|offset| receipt_start + offset)
        .expect("receipt-bound remove command should follow receipt lookup");
    let main_start = TAURI_MAIN[remove_start..]
        .find("fn main()")
        .map(|offset| remove_start + offset)
        .expect("main should follow receipt-bound remove command");
    let receipt_source = &TAURI_MAIN[receipt_start..remove_start];
    let remove_source = &TAURI_MAIN[remove_start..main_start];

    assert!(receipt_source.contains("published_score_pdf_receipt("));
    assert!(remove_source.contains("published_score_pdf_receipt("));
    assert!(remove_source.contains("remove_score_pdf_attachment_if_receipt_matches("));
    assert!(!remove_source.contains("remove_score_pdf_attachment("));
    assert!(!TAURI_MAIN.contains("fn remove_score_pdf("));
}

#[test]
fn tauri_manifest_and_capability_expose_only_receipt_bound_detach_commands() {
    assert!(TAURI_BUILD.contains("\"get_score_pdf_receipt\""));
    assert!(TAURI_BUILD.contains("\"remove_score_pdf_if_receipt_matches\""));
    assert!(!TAURI_BUILD.contains("\"remove_score_pdf\""));

    assert!(TAURI_CAPABILITY.contains("\"allow-get-score-pdf-receipt\""));
    assert!(TAURI_CAPABILITY.contains("\"allow-remove-score-pdf-if-receipt-matches\""));
    assert!(!TAURI_CAPABILITY.contains("\"allow-remove-score-pdf\""));
}

#[test]
fn score_view_detach_reads_receipt_before_metadata_and_deletes_only_by_receipt() {
    let remove_start = SCORE_VIEW
        .find("const handleRemove = async")
        .expect("ScoreView should define the detach interaction");
    let render_start = SCORE_VIEW[remove_start..]
        .find("\n  return (")
        .map(|offset| remove_start + offset)
        .expect("ScoreView render should follow detach interaction");
    let remove_source = &SCORE_VIEW[remove_start..render_start];

    let receipt = remove_source
        .find("getScorePdfReceipt(")
        .expect("detach should capture current storage identity before metadata mutation");
    let metadata = remove_source
        .find("onSongUpdate(")
        .expect("detach should persist metadata removal");
    let deletion = remove_source
        .find("removeScorePdfIfReceiptMatches(")
        .expect("detach should delete only through receipt-bound storage authority");

    assert!(receipt < metadata, "storage identity must be captured before durable metadata detachment");
    assert!(metadata < deletion, "buyer metadata must be detached before destructive byte deletion");
    assert!(SCORE_STORAGE_BRIDGE.contains("get_score_pdf_receipt"));
    assert!(SCORE_STORAGE_BRIDGE.contains("remove_score_pdf_if_receipt_matches"));
    assert!(!SCORE_STORAGE_BRIDGE.contains("\"remove_score_pdf\""));
}
