//! Project-side reconciliation for durable score attachment metadata and Score Storage inventory.
//!
//! Score Storage owns whether a score object exists. Project Persistence owns whether a score id is
//! durably referenced by the project. This module compares those two path-free identity sets without
//! inferring attach/delete intent, touching the filesystem, or copying Score Storage validation.

use std::collections::BTreeSet;

use crate::is_valid_score_id;

const SCORE_RECONCILIATION_ERROR: &str = "Could not reconcile score attachments.";

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

fn validated_identity_set(score_ids: &[String]) -> Result<BTreeSet<String>, String> {
    let mut identities = BTreeSet::new();
    for score_id in score_ids {
        if !is_valid_score_id(score_id) || !identities.insert(score_id.clone()) {
            return Err(SCORE_RECONCILIATION_ERROR.to_string());
        }
    }
    Ok(identities)
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
        assert_eq!(result.as_deref().err(), Some(SCORE_RECONCILIATION_ERROR));
    }
}
