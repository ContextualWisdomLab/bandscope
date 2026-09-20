//! Project-side reconciliation for durable score attachment metadata and Score Storage inventory.
//!
//! Score Storage owns whether a score object exists. Project Persistence owns whether a score id is
//! durably referenced by the project. This module compares those two path-free identity sets without
//! inferring attach/delete intent, touching the filesystem, or copying Score Storage validation.

use std::collections::BTreeSet;

use crate::is_valid_score_id;

const SCORE_RECONCILIATION_ERROR: &str = "Could not reconcile score attachments.";
const SCORE_RECOVERY_ACTION_ERROR: &str = "Could not authorize score attachment recovery action.";
const SCORE_RECOVERED_METADATA_ERROR: &str =
    "Could not prepare recovered score attachment metadata.";

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
/// `Preserve` deliberately performs no storage mutation. `Recover` expresses explicit intent to
/// reattach the current published object using truthful generated presentation metadata. `Discard`
/// expresses explicit cleanup intent. This domain type performs none of those mutations itself.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnreferencedScoreRecoveryDecision {
    /// Leave the published object intact for later inspection or recovery.
    Preserve,
    /// Permit a later Project Persistence transaction to reattach this current published object.
    Recover,
    /// Permit cleanup of this one unreferenced published object.
    Discard,
}

/// Opaque authorization proving that one explicit buyer decision targeted an unreferenced object.
///
/// Fields are private so callers cannot manufacture destructive cleanup or reattachment authority without
/// passing the reconciliation checks in [`authorize_unreferenced_score_recovery_action`]. Authorization
/// is intentionally not a durable capability: every mutation boundary must revalidate the action against
/// fresh reconciliation evidence with [`revalidate_unreferenced_score_recovery_action`].
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

/// Path-free attachment metadata for a buyer-authorized recovery.
///
/// The generated file name is intentionally not the original selected filename. That filename is absent
/// from the restart inventory contract after `PDF durable -> project metadata not durable`. Persisting a
/// generated recovery label avoids inventing provenance while giving Project Persistence a stable display
/// value that can survive the next project save.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveredScoreAttachmentMetadata {
    score_id: String,
    file_name: String,
}

impl RecoveredScoreAttachmentMetadata {
    /// Return the validated score identity to reattach.
    pub fn score_id(&self) -> &str {
        &self.score_id
    }

    /// Return the deterministic generated display filename.
    pub fn file_name(&self) -> &str {
        &self.file_name
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
/// malformed, unknown, duplicated, or cross-set-overlapping identities can never become cleanup or
/// reattachment authority.
///
/// `Preserve`, `Recover`, and `Discard` are all explicit buyer decisions. No action mutates storage here.
/// The returned action is session-local intent, not a durable capability; the current owner evidence must
/// be checked again immediately before metadata or byte mutation.
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

/// Revalidate an authorized decision against fresh Project Persistence and Score Storage evidence.
///
/// Recovery dialogs can remain open while another save, detach, recovery, or cleanup changes lifecycle
/// state. An authorization from an older reconciliation must therefore never cross a later mutation
/// boundary by itself. The score id must still be exactly one current unreferenced-published candidate;
/// if it became referenced, disappeared, moved into the missing-reference set, or the reconciliation is
/// otherwise inconsistent, the action fails closed and the application must refresh recovery state.
///
/// # Errors
///
/// Returns a bounded generic error when the current reconciliation no longer authorizes this score id.
pub fn revalidate_unreferenced_score_recovery_action(
    current_reconciliation: &ScoreAttachmentRecoveryReconciliation,
    action: &AuthorizedUnreferencedScoreRecoveryAction,
) -> Result<(), String> {
    if !is_valid_score_id(&action.score_id) {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    let (_, unreferenced_published, _) = validated_reconciliation_sets(current_reconciliation)?;
    if !unreferenced_published.contains(&action.score_id) {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    Ok(())
}

/// Build truthful durable presentation metadata for one currently valid authorized recovery action.
///
/// The restart inventory carries no original selected filename. A `Recover` action therefore uses a
/// deterministic generated label, `recovered-score-<score-id>.pdf`, rather than claiming the original
/// filename was restored. `Preserve` and `Discard` actions cannot be converted into attachment metadata.
/// The action is revalidated against fresh reconciliation evidence before metadata is emitted so a dialog
/// decision cannot outlive a concurrent attach/detach/recovery state change. This function performs no
/// filesystem or project mutation; the application must still persist the returned metadata through
/// Project Persistence before presenting the attachment as accepted.
///
/// # Errors
///
/// Returns a bounded generic error when the authorized action is not an explicit `Recover` decision or is
/// no longer valid under the supplied current reconciliation.
pub fn recovery_attachment_metadata_for_action(
    current_reconciliation: &ScoreAttachmentRecoveryReconciliation,
    action: &AuthorizedUnreferencedScoreRecoveryAction,
) -> Result<RecoveredScoreAttachmentMetadata, String> {
    if action.decision != UnreferencedScoreRecoveryDecision::Recover {
        return Err(SCORE_RECOVERED_METADATA_ERROR.to_string());
    }
    revalidate_unreferenced_score_recovery_action(current_reconciliation, action)
        .map_err(|_| SCORE_RECOVERED_METADATA_ERROR.to_string())?;

    Ok(RecoveredScoreAttachmentMetadata {
        score_id: action.score_id.clone(),
        file_name: format!("recovered-score-{}.pdf", action.score_id),
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

    #[test]
    fn generated_recovery_metadata_requires_recover_authorization() {
        let reconciliation = ScoreAttachmentRecoveryReconciliation {
            referenced_and_published_score_ids: Vec::new(),
            unreferenced_published_score_ids: vec![SCORE_ID.to_string()],
            missing_referenced_score_ids: Vec::new(),
        };
        let recover = authorize_unreferenced_score_recovery_action(
            &reconciliation,
            SCORE_ID,
            UnreferencedScoreRecoveryDecision::Recover,
        )
        .expect("recovery candidate should authorize explicit recovery");
        let metadata = recovery_attachment_metadata_for_action(&reconciliation, &recover)
            .expect("authorized recovery should produce generated metadata");
        assert_eq!(metadata.score_id(), SCORE_ID);
        assert_eq!(
            metadata.file_name(),
            "recovered-score-6fa459ea-ee8a-4ca4-894e-db77e160355e.pdf"
        );

        let preserve = authorize_unreferenced_score_recovery_action(
            &reconciliation,
            SCORE_ID,
            UnreferencedScoreRecoveryDecision::Preserve,
        )
        .expect("candidate should authorize preserve");
        assert_eq!(
            recovery_attachment_metadata_for_action(&reconciliation, &preserve)
                .err()
                .as_deref(),
            Some(SCORE_RECOVERED_METADATA_ERROR)
        );
    }

    #[test]
    fn stale_authorization_fails_current_revalidation() {
        let initial = ScoreAttachmentRecoveryReconciliation {
            referenced_and_published_score_ids: Vec::new(),
            unreferenced_published_score_ids: vec![SCORE_ID.to_string()],
            missing_referenced_score_ids: Vec::new(),
        };
        let action = authorize_unreferenced_score_recovery_action(
            &initial,
            SCORE_ID,
            UnreferencedScoreRecoveryDecision::Recover,
        )
        .expect("initial candidate should authorize recovery");
        let current = ScoreAttachmentRecoveryReconciliation {
            referenced_and_published_score_ids: vec![SCORE_ID.to_string()],
            unreferenced_published_score_ids: Vec::new(),
            missing_referenced_score_ids: Vec::new(),
        };

        assert_eq!(
            revalidate_unreferenced_score_recovery_action(&current, &action)
                .err()
                .as_deref(),
            Some(SCORE_RECOVERY_ACTION_ERROR)
        );
        assert_eq!(
            recovery_attachment_metadata_for_action(&current, &action)
                .err()
                .as_deref(),
            Some(SCORE_RECOVERED_METADATA_ERROR)
        );
    }
}
