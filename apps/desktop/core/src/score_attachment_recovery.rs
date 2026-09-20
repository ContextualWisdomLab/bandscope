//! Project-side reconciliation for durable score attachment metadata and Score Storage inventory.
//!
//! Score Storage owns whether a score object exists. Project Persistence owns whether a score id is
//! durably referenced by the project. This module compares those two path-free identity sets without
//! inferring attach/delete intent, touching the filesystem, or copying Score Storage validation.

use std::collections::BTreeSet;

use crate::is_valid_score_id;

const SCORE_RECONCILIATION_ERROR: &str = "Could not reconcile score attachments.";
const SCORE_RECOVERY_ACTION_ERROR: &str = "Could not authorize score attachment recovery action.";

/// Path-free reconciliation result between durable project references and published score objects.
///
/// The three sets are mutually exclusive and deterministically sorted. In particular,
/// `unreferenced_published_score_ids` is only a recovery *candidate* set: an id can represent either
/// an interrupted attach whose bytes should be recoverable or a completed metadata detach whose byte
/// cleanup failed. The caller must not auto-attach or auto-delete from this result alone.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreAttachmentRecoveryReconciliation {
    /// Score ids present in both durable project metadata and Score Storage inventory.
    pub referenced_and_published_score_ids: Vec<String>,
    /// Score ids present in Score Storage but absent from durable project metadata.
    pub unreferenced_published_score_ids: Vec<String>,
    /// Score ids referenced by the durable project but absent from Score Storage inventory.
    pub missing_referenced_score_ids: Vec<String>,
}

/// Buyer-selected disposition for a published score object that has no durable project reference.
///
/// `Preserve` deliberately performs no storage mutation. `Discard` expresses explicit cleanup intent,
/// but this domain type does not delete bytes itself; the caller must pass an authorized action to the
/// Score Storage owner after the relevant owner contracts are integrated.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnreferencedScoreRecoveryDecision {
    /// Leave the published object intact for later inspection or recovery.
    Preserve,
    /// Permit cleanup of this one unreferenced published object.
    Discard,
}

/// Opaque authorization proving that one explicit buyer decision targeted a current unreferenced object.
///
/// Fields are private so callers cannot manufacture destructive cleanup authority without passing the
/// reconciliation checks in [`authorize_unreferenced_score_recovery_action`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizedUnreferencedScoreRecoveryAction {
    score_id: String,
    decision: UnreferencedScoreRecoveryDecision,
}

impl AuthorizedUnreferencedScoreRecoveryAction {
    /// Return the validated score identity covered by this authorization.
    pub fn score_id(&self) -> &str {
        &self.score_id
    }

    /// Return the explicit buyer-selected disposition.
    pub fn decision(&self) -> UnreferencedScoreRecoveryDecision {
        self.decision
    }
}

fn validated_identity_set(score_ids: &[String]) -> Result<BTreeSet<String>, String> {
    let mut identities = BTreeSet::new();
    for score_id in score_ids {
        if !is_valid_score_id(score_id) || !identities.insert(score_id.clone()) {
            return Err(SCORE_RECONCILIATION_ERROR.to_string());
        }
    }
    Ok(identities)
}

fn validated_reconciliation_sets(
    reconciliation: &ScoreAttachmentRecoveryReconciliation,
) -> Result<(BTreeSet<String>, BTreeSet<String>, BTreeSet<String>), String> {
    let referenced_and_published =
        validated_identity_set(&reconciliation.referenced_and_published_score_ids)
            .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())?;
    let unreferenced_published =
        validated_identity_set(&reconciliation.unreferenced_published_score_ids)
            .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())?;
    let missing_referenced = validated_identity_set(&reconciliation.missing_referenced_score_ids)
        .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())?;

    if referenced_and_published
        .intersection(&unreferenced_published)
        .next()
        .is_some()
        || referenced_and_published
            .intersection(&missing_referenced)
            .next()
            .is_some()
        || unreferenced_published
            .intersection(&missing_referenced)
            .next()
            .is_some()
    {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    Ok((
        referenced_and_published,
        unreferenced_published,
        missing_referenced,
    ))
}

/// Compare durable Project Persistence attachment ids with Score Storage's validated object inventory.
///
/// Both inputs must contain unique canonical BandScope score ids. Invalid or duplicate identities fail
/// closed because either condition makes lifecycle evidence ambiguous. No filesystem path or PDF content
/// crosses this boundary, and the function deliberately returns classification only: it never chooses
/// recover, keep, discard, attach, or delete on the buyer's behalf.
///
/// # Errors
///
/// Returns a bounded generic error when either input contains a malformed or duplicate score id.
pub fn derive_score_attachment_recovery_candidates(
    durable_project_score_ids: &[String],
    published_score_ids: &[String],
) -> Result<ScoreAttachmentRecoveryReconciliation, String> {
    let durable = validated_identity_set(durable_project_score_ids)?;
    let published = validated_identity_set(published_score_ids)?;

    Ok(ScoreAttachmentRecoveryReconciliation {
        referenced_and_published_score_ids: durable
            .intersection(&published)
            .cloned()
            .collect(),
        unreferenced_published_score_ids: published
            .difference(&durable)
            .cloned()
            .collect(),
        missing_referenced_score_ids: durable
            .difference(&published)
            .cloned()
            .collect(),
    })
}

/// Authorize one explicit disposition for an unreferenced published score object.
///
/// The supplied reconciliation may originate outside this module because its classification fields are
/// public for IPC/application consumption. This function therefore revalidates every identity and the
/// mutual-exclusion invariant before issuing authorization. Referenced-and-published, missing-reference,
/// malformed, unknown, duplicated, or cross-set-overlapping identities can never become cleanup authority.
///
/// `Preserve` and `Discard` are both explicit buyer decisions. Neither action mutates storage here.
/// Project Persistence therefore remains unable to delete Score Storage bytes on classification alone,
/// while a later integration can require this opaque authorization before destructive cleanup.
///
/// # Errors
///
/// Returns a bounded generic error if the reconciliation is inconsistent or `score_id` is not exactly one
/// current `unreferenced_published_score_ids` candidate.
pub fn authorize_unreferenced_score_recovery_action(
    reconciliation: &ScoreAttachmentRecoveryReconciliation,
    score_id: &str,
    decision: UnreferencedScoreRecoveryDecision,
) -> Result<AuthorizedUnreferencedScoreRecoveryAction, String> {
    if !is_valid_score_id(score_id) {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    let (_, unreferenced_published, _) = validated_reconciliation_sets(reconciliation)?;
    if !unreferenced_published.contains(score_id) {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    Ok(AuthorizedUnreferencedScoreRecoveryAction {
        score_id: score_id.to_string(),
        decision,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

    #[test]
    fn empty_sets_reconcile_without_candidates() {
        let result = derive_score_attachment_recovery_candidates(&[], &[])
            .expect("empty owner sets should be a valid steady state");
        assert!(result.referenced_and_published_score_ids.is_empty());
        assert!(result.unreferenced_published_score_ids.is_empty());
        assert!(result.missing_referenced_score_ids.is_empty());
    }

    #[test]
    fn duplicate_published_identity_fails_closed() {
        let result = derive_score_attachment_recovery_candidates(
            &[SCORE_ID.to_string()],
            &[SCORE_ID.to_string(), SCORE_ID.to_string()],
        );
        assert_eq!(result.err().as_deref(), Some(SCORE_RECONCILIATION_ERROR));
    }

    #[test]
    fn authorization_revalidates_public_reconciliation_state() {
        let forged = ScoreAttachmentRecoveryReconciliation {
            referenced_and_published_score_ids: vec![SCORE_ID.to_string()],
            unreferenced_published_score_ids: vec![SCORE_ID.to_string()],
            missing_referenced_score_ids: Vec::new(),
        };

        assert_eq!(
            authorize_unreferenced_score_recovery_action(
                &forged,
                SCORE_ID,
                UnreferencedScoreRecoveryDecision::Discard,
            )
            .err()
            .as_deref(),
            Some(SCORE_RECOVERY_ACTION_ERROR)
        );
    }
}
