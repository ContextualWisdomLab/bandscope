//! Project identity and revision binding for score recovery intent.
//!
//! Recovery reconciliation is path-free and score-id based, but a buyer decision is made while one
//! durable project aggregate revision is active. The same score candidate can remain visible after the
//! application switches projects or after another writer updates the same project, so score-set
//! revalidation alone is insufficient mutation authority. This module binds the otherwise valid recovery
//! action to both the app-owned project identity and durable content revision that authorized it.

use crate::{
    runtime_core::is_valid_project_id,
    score_attachment_recovery::{
        authorize_unreferenced_score_recovery_action,
        recovery_attachment_metadata_for_action,
        revalidate_unreferenced_score_recovery_action,
        AuthorizedUnreferencedScoreRecoveryAction,
        RecoveredScoreAttachmentMetadata,
        ScoreAttachmentRecoveryReconciliation,
        UnreferencedScoreRecoveryDecision,
    },
};

const SCORE_RECOVERY_ACTION_ERROR: &str = "Could not authorize score attachment recovery action.";
const SCORE_RECOVERED_METADATA_ERROR: &str =
    "Could not prepare recovered score attachment metadata.";

fn is_valid_project_revision(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Session-local score recovery intent bound to one durable app-owned project revision.
///
/// This type is deliberately opaque. A score recovery decision that was valid for Project A must never
/// become mutation authority for Project B, and a decision from revision R1 must never survive an R2
/// update of the same project merely because both states classify the same score id as unreferenced and
/// published.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectScopedScoreRecoveryAction {
    project_id: String,
    project_revision: String,
    action: AuthorizedUnreferencedScoreRecoveryAction,
}

impl ProjectScopedScoreRecoveryAction {
    /// Return the validated app-owned project identity that authorized this decision.
    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    /// Return the canonical lowercase SHA-256 project revision that authorized this decision.
    pub fn project_revision(&self) -> &str {
        &self.project_revision
    }

    /// Return the validated score identity covered by this decision.
    pub fn score_id(&self) -> &str {
        self.action.score_id()
    }

    /// Return the explicit buyer-selected disposition.
    pub fn decision(&self) -> UnreferencedScoreRecoveryDecision {
        self.action.decision()
    }
}

/// Authorize one explicit score-recovery disposition for the currently active durable project revision.
///
/// The project identity is validated with the same canonical `project-<nanos>-<counter>` contract used
/// by Project Persistence. The project revision must be the canonical lowercase SHA-256 token returned by
/// the durable workspace publication/load boundary. Reconciliation and score-id checks remain owned by
/// the existing recovery domain; this function adds aggregate identity and revision freshness without
/// acquiring Score Storage filesystem authority.
///
/// # Errors
///
/// Returns a bounded generic error when the project id or revision is malformed or the underlying score
/// recovery reconciliation cannot authorize the requested candidate and decision.
pub fn authorize_project_scoped_score_recovery_action(
    project_id: &str,
    project_revision: &str,
    reconciliation: &ScoreAttachmentRecoveryReconciliation,
    score_id: &str,
    decision: UnreferencedScoreRecoveryDecision,
) -> Result<ProjectScopedScoreRecoveryAction, String> {
    if !is_valid_project_id(project_id) || !is_valid_project_revision(project_revision) {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    let action = authorize_unreferenced_score_recovery_action(reconciliation, score_id, decision)
        .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())?;
    Ok(ProjectScopedScoreRecoveryAction {
        project_id: project_id.to_string(),
        project_revision: project_revision.to_string(),
        action,
    })
}

/// Revalidate a project-scoped decision against fresh aggregate identity, revision, and recovery evidence.
///
/// The caller must supply the project identity and durable revision reread at the mutation boundary.
/// Switching projects or changing the durable revision invalidates the previous decision even when the
/// current score candidate sets are byte-for-byte equal. The score lifecycle evidence is then
/// revalidated by the existing recovery domain.
///
/// # Errors
///
/// Returns a bounded generic error when the active project or revision changed, either current token is
/// malformed, or the underlying score candidate no longer has unreferenced-published status.
pub fn revalidate_project_scoped_score_recovery_action(
    current_project_id: &str,
    current_project_revision: &str,
    current_reconciliation: &ScoreAttachmentRecoveryReconciliation,
    action: &ProjectScopedScoreRecoveryAction,
) -> Result<(), String> {
    if !is_valid_project_id(current_project_id)
        || !is_valid_project_revision(current_project_revision)
        || action.project_id != current_project_id
        || action.project_revision != current_project_revision
    {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    revalidate_unreferenced_score_recovery_action(current_reconciliation, &action.action)
        .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())
}

/// Build recovered attachment metadata only for a still-current revision-bound Recover decision.
///
/// Project identity, durable revision, and fresh recovery evidence are checked before metadata can be
/// emitted. The underlying recovery domain still owns the truthful generated filename and rejects
/// Preserve/Discard decisions. This function performs no project or filesystem mutation.
///
/// # Errors
///
/// Returns a bounded generic error when the project or revision changed, recovery evidence changed, or
/// the action is not an explicit Recover decision.
pub fn recovery_attachment_metadata_for_project_action(
    current_project_id: &str,
    current_project_revision: &str,
    current_reconciliation: &ScoreAttachmentRecoveryReconciliation,
    action: &ProjectScopedScoreRecoveryAction,
) -> Result<RecoveredScoreAttachmentMetadata, String> {
    revalidate_project_scoped_score_recovery_action(
        current_project_id,
        current_project_revision,
        current_reconciliation,
        action,
    )
    .map_err(|_| SCORE_RECOVERED_METADATA_ERROR.to_string())?;

    recovery_attachment_metadata_for_action(current_reconciliation, &action.action)
        .map_err(|_| SCORE_RECOVERED_METADATA_ERROR.to_string())
}
