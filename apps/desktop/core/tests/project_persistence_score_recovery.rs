use bandscope_desktop_core::derive_score_attachment_recovery_candidates;

const REFERENCED_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const PUBLISHED_ONLY_ID: &str = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";
const MISSING_ID: &str = "7a0f4b3d-f83d-4b5c-8b6e-2e2f1cf2a901";

#[test]
fn reconciliation_distinguishes_unreferenced_bytes_from_missing_references() {
    let reconciliation = derive_score_attachment_recovery_candidates(
        &[REFERENCED_ID.to_string(), MISSING_ID.to_string()],
        &[PUBLISHED_ONLY_ID.to_string(), REFERENCED_ID.to_string()],
    )
    .expect("valid owner identities should reconcile");

    assert_eq!(
        reconciliation.referenced_and_published_score_ids,
        vec![REFERENCED_ID.to_string()]
    );
    assert_eq!(
        reconciliation.unreferenced_published_score_ids,
        vec![PUBLISHED_ONLY_ID.to_string()]
    );
    assert_eq!(
        reconciliation.missing_referenced_score_ids,
        vec![MISSING_ID.to_string()]
    );
}

#[test]
fn reconciliation_is_deterministic_and_does_not_infer_recovery_intent() {
    let second = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let first = "11111111-1111-4111-8111-111111111111";

    let reconciliation = derive_score_attachment_recovery_candidates(
        &[],
        &[second.to_string(), first.to_string()],
    )
    .expect("valid inventory should reconcile");

    assert!(reconciliation.referenced_and_published_score_ids.is_empty());
    assert!(reconciliation.missing_referenced_score_ids.is_empty());
    assert_eq!(
        reconciliation.unreferenced_published_score_ids,
        vec![first.to_string(), second.to_string()]
    );
}

#[test]
fn reconciliation_rejects_duplicate_or_malformed_owner_identities() {
    let duplicate = derive_score_attachment_recovery_candidates(
        &[REFERENCED_ID.to_string(), REFERENCED_ID.to_string()],
        &[REFERENCED_ID.to_string()],
    );
    assert_eq!(
        duplicate.err().as_deref(),
        Some("Could not reconcile score attachments.")
    );

    let malformed = derive_score_attachment_recovery_candidates(
        &["../escape".to_string()],
        &[REFERENCED_ID.to_string()],
    );
    assert_eq!(
        malformed.err().as_deref(),
        Some("Could not reconcile score attachments.")
    );
}
