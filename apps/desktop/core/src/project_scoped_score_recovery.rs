//! Project-identity binding for score recovery intent.
//!
//! Recovery reconciliation is path-free and score-id based, but a buyer decision is made while one
//! project aggregate is active. The same score candidate can remain visible after the application
//! switches projects, so score-set revalidation alone is insufficient mutation authority. This module
//! binds the otherwise valid recovery action to the app-owned project identity that authorized it.

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

/// Session-local score recovery intent bound to one app-owned project aggregate.
///
/// This type is deliberately opaque. A score recovery decision that was valid for Project A must never
/// become mutation authority for Project B merely because both projects currently classify the same
/// score id as unreferenced and published.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectScopedScoreRecoveryAction {
    project_id: String,
    action: AuthorizedUnreferencedScoreRecoveryAction,
}

impl ProjectScopedScoreRecoveryAction {
    /// Return the validated app-owned project identity that authorized this decision.
    pub fn project_id(&self) -> &str {
        &self.project_id
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

/// Authorize one explicit score-recovery disposition for the currently active app-owned project.
///
/// The project identity is validated with the same canonical `project-<nanos>-<counter>` contract used
/// by Project Persistence before being retained inside the opaque action. Reconciliation and score-id
/// checks remain owned by the existing recovery domain; this function only adds the missing aggregate
/// identity boundary.
///
/// # Errors
///
/// Returns a bounded generic error when the project id is malformed or the underlying score recovery
/// reconciliation cannot authorize the requested candidate and decision.
pub fn authorize_project_scoped_score_recovery_action(
    project_id: &str,
    reconciliation: &ScoreAttachmentRecoveryReconciliation,
    score_id: &str,
    decision: UnreferencedScoreRecoveryDecision,
) -> Result<ProjectScopedScoreRecoveryAction, String> {
    if !is_valid_project_id(project_id) {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    let action = authorize_unreferenced_score_recovery_action(reconciliation, score_id, decision)
        .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())?;
    Ok(ProjectScopedScoreRecoveryAction {
        project_id: project_id.to_string(),
        action,
    })
}

/// Revalidate a project-scoped decision against fresh aggregate identity and recovery evidence.
///
/// The caller must supply the project identity active at the mutation boundary. Switching projects
/// invalidates the previous decision even when the current score candidate sets are byte-for-byte equal.
/// The score lifecycle evidence is then revalidated by the existing recovery domain.
///
/// # Errors
///
/// Returns a bounded generic error when the active project changed, the project id is malformed, or the
/// underlying score candidate no longer has unreferenced-published status.
pub fn revalidate_project_scoped_score_recovery_action(
    current_project_id: &str,
    current_reconciliation: &ScoreAttachmentRecoveryReconciliation,
    action: &ProjectScopedScoreRecoveryAction,
) -> Result<(), String> {
    if !is_valid_project_id(current_project_id) || action.project_id != current_project_id {
        return Err(SCORE_RECOVERY_ACTION_ERROR.to_string());
    }

    revalidate_unreferenced_score_recovery_action(current_reconciliation, &action.action)
        .map_err(|_| SCORE_RECOVERY_ACTION_ERROR.to_string())
}

/// Build recovered attachment metadata only for a still-current project-scoped Recover decision.
///
/// Project identity and fresh recovery evidence are checked before metadata can be emitted. The underlying
/// recovery domain still owns the truthful generated filename and rejects Preserve/Discard decisions.
/// This function performs no project or filesystem mutation.
///
/// # Errors
///
/// Returns a bounded generic error when the project changed, recovery evidence changed, or the action is
/// not an explicit Recover decision.
pub fn recovery_attachment_metadata_for_project_action(
    current_project_id: &str,
    current_reconciliation: &ScoreAttachmentRecoveryReconciliation,
    action: &ProjectScopedScoreRecoveryAction,
) -> Result<RecoveredScoreAttachmentMetadata, String> {
    revalidate_project_scoped_score_recovery_action(
        current_project_id,
        current_reconciliation,
        action,
    )
    .map_err(|_| SCORE_RECOVERED_METADATA_ERROR.to_string())?;

    recovery_attachment_metadata_for_action(current_reconciliation, &action.action)
        .map_err(|_| SCORE_RECOVERED_METADATA_ERROR.to_string())
}
