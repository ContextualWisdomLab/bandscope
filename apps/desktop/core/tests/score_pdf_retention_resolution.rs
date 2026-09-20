use bandscope_desktop_core::resolve_score_pdf_for_removal;
use std::fs;

fn unique_temp_dir(label: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "bandscope-score-retention-{label}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should follow UNIX epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("retention test root should be created");
    root
}

#[test]
fn removal_resolution_returns_none_only_for_an_absent_entry() {
    let scores_root = unique_temp_dir("missing");
    let score_id = "11111111-1111-4111-8111-111111111111";
    let result = resolve_score_pdf_for_removal(&scores_root, score_id)
        .expect("genuinely absent score should be an idempotent removal");
    assert!(result.is_none());
    fs::remove_dir_all(scores_root).expect("retention test root should be removed");
}

#[test]
fn removal_resolution_rejects_a_missing_scores_root() {
    let parent = unique_temp_dir("missing-root");
    let scores_root = parent.join("scores-not-created");
    let score_id = "55555555-5555-4555-8555-555555555555";

    assert!(resolve_score_pdf_for_removal(&scores_root, score_id).is_err());
    fs::remove_dir_all(parent).expect("retention test parent should be removed");
}

#[test]
fn removal_resolution_returns_the_existing_regular_score() {
    let scores_root = unique_temp_dir("regular");
    let score_id = "22222222-2222-4222-8222-222222222222";
    let path = scores_root.join(format!("{score_id}.pdf"));
    fs::write(&path, b"%PDF-retention").expect("score fixture should be written");

    let resolved = resolve_score_pdf_for_removal(&scores_root, score_id)
        .expect("regular score should resolve")
        .expect("existing score should not be reported absent");
    assert_eq!(resolved, path.canonicalize().expect("score path should canonicalize"));

    fs::remove_dir_all(scores_root).expect("retention test root should be removed");
}

#[test]
fn removal_resolution_rejects_a_directory_instead_of_reporting_absent() {
    let scores_root = unique_temp_dir("directory");
    let score_id = "33333333-3333-4333-8333-333333333333";
    fs::create_dir(scores_root.join(format!("{score_id}.pdf")))
        .expect("directory fixture should be created");

    assert!(resolve_score_pdf_for_removal(&scores_root, score_id).is_err());
    fs::remove_dir_all(scores_root).expect("retention test root should be removed");
}

#[cfg(unix)]
#[test]
fn removal_resolution_rejects_a_symlink_instead_of_reporting_absent() {
    use std::os::unix::fs::symlink;

    let scores_root = unique_temp_dir("symlink");
    let target = scores_root.join("foreign.pdf");
    fs::write(&target, b"%PDF-foreign").expect("foreign score fixture should be written");
    let score_id = "44444444-4444-4444-8444-444444444444";
    symlink(&target, scores_root.join(format!("{score_id}.pdf")))
        .expect("symlink fixture should be created");

    assert!(resolve_score_pdf_for_removal(&scores_root, score_id).is_err());
    fs::remove_dir_all(scores_root).expect("retention test root should be removed");
}

const TAURI_MAIN: &str = include_str!("../../src-tauri/src/main.rs");

#[test]
fn tauri_receipt_bound_removal_preserves_unsafe_workspace_errors() {
    let remove_start = TAURI_MAIN
        .find("fn remove_score_pdf_if_receipt_matches(")
        .expect("receipt-bound remove command should exist");
    let main_start = TAURI_MAIN[remove_start..]
        .find("fn main()")
        .map(|offset| remove_start + offset)
        .expect("main should follow receipt-bound remove command");
    let remove_source = &TAURI_MAIN[remove_start..main_start];

    assert!(remove_source.contains("published_score_pdf_receipt(&scores_root, &score_id)?"));
    assert!(remove_source.contains("remove_score_pdf_attachment_if_receipt_matches("));
    assert!(!remove_source.contains("Err(_) => return Ok(false)"));
    assert!(!remove_source.contains("remove_score_pdf_attachment(&"));
}
