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
    let result = resolve_score_pdf_for_removal(&scores_root, "score-missing")
        .expect("genuinely absent score should be an idempotent removal");
    assert!(result.is_none());
    fs::remove_dir_all(scores_root).expect("retention test root should be removed");
}

#[test]
fn removal_resolution_returns_the_existing_regular_score() {
    let scores_root = unique_temp_dir("regular");
    let score_id = "score-regular";
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
    let score_id = "score-directory";
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
    let score_id = "score-symlink";
    symlink(&target, scores_root.join(format!("{score_id}.pdf")))
        .expect("symlink fixture should be created");

    assert!(resolve_score_pdf_for_removal(&scores_root, score_id).is_err());
    fs::remove_dir_all(scores_root).expect("retention test root should be removed");
}

const TAURI_MAIN: &str = include_str!("../../src-tauri/src/main.rs");

#[test]
fn tauri_removal_preserves_unsafe_resolution_errors() {
    let remove_start = TAURI_MAIN
        .find("fn remove_score_pdf(")
        .expect("remove_score_pdf command should exist");
    let main_start = TAURI_MAIN[remove_start..]
        .find("fn main()")
        .map(|offset| remove_start + offset)
        .expect("main should follow remove_score_pdf command");
    let remove_source = &TAURI_MAIN[remove_start..main_start];

    assert!(remove_source.contains("resolve_score_pdf_for_removal("));
    assert!(!remove_source.contains("Err(_) => return Ok(false)"));
}
