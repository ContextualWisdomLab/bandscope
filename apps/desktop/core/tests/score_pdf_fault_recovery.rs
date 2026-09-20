use bandscope_desktop_core::inventory_published_score_pdf_receipts;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-score-fault-{name}-{suffix}"))
}

#[test]
fn interrupted_partial_stage_is_retired_without_inventing_a_published_object() {
    let root = unique_test_dir("partial-stage");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let stage = root.join(format!(".score-{SCORE_ID}.stage"));

    // A process can disappear while the fixed-buffer copy is still incomplete.
    // Recovery owns the reserved temporary namespace, so an incomplete
    // stage-only residue is cleanup state, not a published score candidate.
    std::fs::write(&stage, b"%PD").expect("partial stage fixture should be written");

    let receipts = inventory_published_score_pdf_receipts(&root)
        .expect("restart recovery should retire a partial stage-only residue");

    assert!(receipts.is_empty(), "partial staging must not become buyer-visible object truth");
    assert!(!stage.exists(), "restart recovery should retire only the reserved partial stage");
    let _ = std::fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn unreadable_reserved_stage_fails_closed_and_preserves_evidence() {
    use std::os::unix::fs::PermissionsExt;

    let root = unique_test_dir("permission-denied-stage");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    std::fs::write(&stage, b"%PDF-1.7\npermission fault")
        .expect("reserved stage fixture should be written");
    std::fs::set_permissions(&stage, std::fs::Permissions::from_mode(0o000))
        .expect("permission fault should be installed");

    let result = inventory_published_score_pdf_receipts(&root);

    assert!(result.is_err(), "indeterminate stage content must fail closed");
    assert!(stage.exists(), "permission failure must preserve the reserved stage as evidence");

    std::fs::set_permissions(&stage, std::fs::Permissions::from_mode(0o600))
        .expect("fixture permissions should be restored for cleanup");
    let _ = std::fs::remove_dir_all(root);
}
