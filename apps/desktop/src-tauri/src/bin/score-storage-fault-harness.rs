use bandscope_desktop_core::publish_score_pdf_attachment;
use std::path::PathBuf;

const CHILD_MODE_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_CHILD";
const ROOT_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_ROOT";
const SOURCE_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_SOURCE";
const SCORE_ID_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_SCORE_ID";

fn required_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var_os(name).unwrap_or_else(|| panic!("missing owner-test env {name}")))
}

fn main() {
    if std::env::var_os(CHILD_MODE_ENV).is_none() {
        panic!("score-storage fault harness is owner-test-only");
    }

    let scores_root = required_path(ROOT_ENV);
    let source = required_path(SOURCE_ENV);
    let score_id = std::env::var(SCORE_ID_ENV).expect("score id should be supplied by the owner test");

    publish_score_pdf_attachment(&source, &scores_root, &score_id)
        .expect("desktop-package publisher should reach the requested checkpoint before returning");
    panic!("desktop-package publisher unexpectedly returned instead of waiting at the checkpoint");
}
