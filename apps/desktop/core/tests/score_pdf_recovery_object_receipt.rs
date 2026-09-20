use bandscope_desktop_core::{
    inventory_published_score_pdf_receipts, publish_score_pdf_attachment,
    remove_score_pdf_attachment, remove_score_pdf_attachment_if_receipt_matches,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SCORE_ID: &str = "018f2a2b-9c1d-7a40-8b31-6f7cbbf05001";

fn unique_temp_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "bandscope-score-recovery-receipt-{label}-{}-{nonce}",
        std::process::id()
    ))
}

fn write_pdf(path: &Path, marker: &[u8]) {
    let mut bytes = b"%PDF-1.7\n".to_vec();
    bytes.extend_from_slice(marker);
    bytes.extend_from_slice(b"\n%%EOF\n");
    fs::write(path, bytes).expect("fixture PDF should be writable");
}

#[test]
fn stale_receipt_cannot_remove_same_id_republished_bytes() {
    let root = unique_temp_dir("aba");
    let scores_root = root.join("scores");
    let source_a = root.join("a.pdf");
    let source_b = root.join("b.pdf");
    fs::create_dir_all(&root).expect("fixture root should be creatable");
    write_pdf(&source_a, b"first durable score bytes");
    write_pdf(&source_b, b"replacement durable score bytes");

    publish_score_pdf_attachment(&source_a, &scores_root, SCORE_ID)
        .expect("first production publication should succeed");
    let receipt_a = inventory_published_score_pdf_receipts(&scores_root)
        .expect("first inventory should succeed")
        .into_iter()
        .find(|receipt| receipt.score_id() == SCORE_ID)
        .expect("first published object should have a receipt");

    remove_score_pdf_attachment(&scores_root.join(format!("{SCORE_ID}.pdf")))
        .expect("explicit owner removal should remove first object");
    publish_score_pdf_attachment(&source_b, &scores_root, SCORE_ID)
        .expect("same id may currently be republished with different bytes");

    let receipt_b = inventory_published_score_pdf_receipts(&scores_root)
        .expect("second inventory should succeed")
        .into_iter()
        .find(|receipt| receipt.score_id() == SCORE_ID)
        .expect("replacement object should have a receipt");
    assert_ne!(
        receipt_a.content_sha256(),
        receipt_b.content_sha256(),
        "replacement bytes must produce a new object receipt"
    );

    let stale_result = remove_score_pdf_attachment_if_receipt_matches(&scores_root, &receipt_a)
        .expect("stale object identity should be a safe non-removal outcome");
    assert!(
        !stale_result,
        "a stale receipt must not remove replacement bytes published under the same score id"
    );
    assert!(
        scores_root.join(format!("{SCORE_ID}.pdf")).exists(),
        "replacement bytes must remain after stale recovery intent"
    );

    assert!(
        remove_score_pdf_attachment_if_receipt_matches(&scores_root, &receipt_b)
            .expect("fresh receipt should authorize deletion of the exact replacement object")
    );
    assert!(
        !scores_root.join(format!("{SCORE_ID}.pdf")).exists(),
        "fresh receipt deletion should remove the exact current object"
    );

    fs::remove_dir_all(&root).expect("fixture root should be removable");
}
