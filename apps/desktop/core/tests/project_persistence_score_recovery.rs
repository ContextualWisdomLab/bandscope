use bandscope_desktop_core::{
    authorize_unreferenced_score_recovery_action,
    derive_score_attachment_recovery_candidates,
    recovery_attachment_metadata_for_action,
    revalidate_unreferenced_score_recovery_action,
    ScoreAttachmentRecoveryReconciliation,
    UnreferencedScoreRecoveryDecision,
};

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

#[test]
fn unreferenced_published_score_requires_an_explicit_preserve_recover_or_discard_decision() {
    let reconciliation = derive_score_attachment_recovery_candidates(
        &[REFERENCED_ID.to_string(), MISSING_ID.to_string()],
        &[PUBLISHED_ONLY_ID.to_string(), REFERENCED_ID.to_string()],
    )
    .expect("valid owner identities should reconcile");

    let preserve = authorize_unreferenced_score_recovery_action(
        &reconciliation,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Preserve,
    )
    .expect("buyer may explicitly preserve an unreferenced published object");
    assert_eq!(preserve.score_id(), PUBLISHED_ONLY_ID);
    assert_eq!(
        preserve.decision(),
        UnreferencedScoreRecoveryDecision::Preserve
    );

    let recover = authorize_unreferenced_score_recovery_action(
        &reconciliation,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Recover,
    )
    .expect("buyer may explicitly recover an unreferenced published object");
    assert_eq!(recover.score_id(), PUBLISHED_ONLY_ID);
    assert_eq!(
        recover.decision(),
        UnreferencedScoreRecoveryDecision::Recover
    );

    let discard = authorize_unreferenced_score_recovery_action(
        &reconciliation,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Discard,
    )
    .expect("buyer may explicitly discard an unreferenced published object");
    assert_eq!(discard.score_id(), PUBLISHED_ONLY_ID);
    assert_eq!(
        discard.decision(),
        UnreferencedScoreRecoveryDecision::Discard
    );
}

#[test]
fn recover_action_produces_truthful_generated_metadata_without_claiming_original_filename() {
    let reconciliation = derive_score_attachment_recovery_candidates(
        &[],
        &[PUBLISHED_ONLY_ID.to_string()],
    )
    .expect("published-only score should be a recovery candidate");
    let recover = authorize_unreferenced_score_recovery_action(
        &reconciliation,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Recover,
    )
    .expect("buyer recovery decision should be authorized");

    let metadata = recovery_attachment_metadata_for_action(&reconciliation, &recover)
        .expect("authorized recovery should produce durable presentation metadata");

    assert_eq!(metadata.score_id(), PUBLISHED_ONLY_ID);
    assert_eq!(
        metadata.file_name(),
        "recovered-score-3f2c8f0e-1a2b-4c3d-8e9f-001122334455.pdf"
    );
    assert!(!metadata.file_name().contains("opener"));
}

#[test]
fn preserve_or_discard_actions_cannot_become_recovered_attachment_metadata() {
    let reconciliation = derive_score_attachment_recovery_candidates(
        &[],
        &[PUBLISHED_ONLY_ID.to_string()],
    )
    .expect("published-only score should be a recovery candidate");

    for decision in [
        UnreferencedScoreRecoveryDecision::Preserve,
        UnreferencedScoreRecoveryDecision::Discard,
    ] {
        let action = authorize_unreferenced_score_recovery_action(
            &reconciliation,
            PUBLISHED_ONLY_ID,
            decision,
        )
        .expect("non-recovery disposition should still be authorizable");
        assert_eq!(
            recovery_attachment_metadata_for_action(&reconciliation, &action)
                .err()
                .as_deref(),
            Some("Could not prepare recovered score attachment metadata.")
        );
    }
}

#[test]
fn recovery_action_never_authorizes_referenced_missing_or_unknown_score_ids() {
    let reconciliation = derive_score_attachment_recovery_candidates(
        &[REFERENCED_ID.to_string(), MISSING_ID.to_string()],
        &[PUBLISHED_ONLY_ID.to_string(), REFERENCED_ID.to_string()],
    )
    .expect("valid owner identities should reconcile");

    for score_id in [
        REFERENCED_ID,
        MISSING_ID,
        "11111111-1111-4111-8111-111111111111",
        "../escape",
    ] {
        let result = authorize_unreferenced_score_recovery_action(
            &reconciliation,
            score_id,
            UnreferencedScoreRecoveryDecision::Discard,
        );
        assert_eq!(
            result.err().as_deref(),
            Some("Could not authorize score attachment recovery action."),
            "{score_id} must not become cleanup authority"
        );
    }
}

#[test]
fn forged_overlapping_reconciliation_cannot_authorize_destructive_cleanup() {
    let forged = ScoreAttachmentRecoveryReconciliation {
        referenced_and_published_score_ids: vec![PUBLISHED_ONLY_ID.to_string()],
        unreferenced_published_score_ids: vec![PUBLISHED_ONLY_ID.to_string()],
        missing_referenced_score_ids: Vec::new(),
    };

    let result = authorize_unreferenced_score_recovery_action(
        &forged,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Discard,
    );
    assert_eq!(
        result.err().as_deref(),
        Some("Could not authorize score attachment recovery action.")
    );
}

#[test]
fn stale_recovery_authorization_cannot_cross_a_changed_reconciliation() {
    let initial = derive_score_attachment_recovery_candidates(
        &[],
        &[PUBLISHED_ONLY_ID.to_string()],
    )
    .expect("published-only score should initially be recoverable");
    let recover = authorize_unreferenced_score_recovery_action(
        &initial,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Recover,
    )
    .expect("initial recovery decision should be authorized");
    let discard = authorize_unreferenced_score_recovery_action(
        &initial,
        PUBLISHED_ONLY_ID,
        UnreferencedScoreRecoveryDecision::Discard,
    )
    .expect("initial discard decision should be authorized");

    let current = derive_score_attachment_recovery_candidates(
        &[PUBLISHED_ONLY_ID.to_string()],
        &[PUBLISHED_ONLY_ID.to_string()],
    )
    .expect("current owner evidence should show the score as referenced");

    for action in [&recover, &discard] {
        assert_eq!(
            revalidate_unreferenced_score_recovery_action(&current, action)
                .err()
                .as_deref(),
            Some("Could not authorize score attachment recovery action."),
            "a decision from an older reconciliation must not survive current owner evidence"
        );
    }
    assert_eq!(
        recovery_attachment_metadata_for_action(&current, &recover)
            .err()
            .as_deref(),
        Some("Could not prepare recovered score attachment metadata."),
        "stale recovery authority must not become durable metadata"
    );
}
