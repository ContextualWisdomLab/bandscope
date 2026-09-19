use crate::runtime_core::{is_valid_score_id, resolve_existing_score_pdf};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

const SCORE_REMOVE_ERROR: &str = "Could not remove the score PDF.";

/// Resolve one score attachment for idempotent removal without collapsing
/// unsafe or indeterminate filesystem states into "already absent".
///
/// `Ok(None)` is returned only when a validated, existing score workspace lacks
/// the exact app-owned `<score_id>.pdf` directory entry. Once an entry is
/// observed, the existing score-path authority validates the regular-file,
/// symlink, canonicalization, and containment contract. Any validation or I/O
/// failure after that point is an error, including a concurrent disappearance;
/// callers must not erase buyer metadata on those failures.
///
/// Security Notes: the score id is allowlisted before the path join. This helper
/// verifies that the supplied score workspace itself exists as a directory before
/// interpreting child `NotFound`; broader app-owned workspace/link authority stays
/// with Project Persistence. Errors do not expose the local path or score bytes.
/// There is an unavoidable race after an observed child `NotFound`: another local
/// actor can create the name before the caller updates metadata, so this contract
/// proves an absence observation, not durable pathname non-existence.
pub fn resolve_score_pdf_for_removal(
    scores_root: &Path,
    score_id: &str,
) -> Result<Option<PathBuf>, String> {
    if !is_valid_score_id(score_id) {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }

    let root_metadata = fs::symlink_metadata(scores_root)
        .map_err(|_| SCORE_REMOVE_ERROR.to_string())?;
    if !root_metadata.is_dir() {
        return Err(SCORE_REMOVE_ERROR.to_string());
    }

    let candidate = scores_root.join(format!("{score_id}.pdf"));
    match fs::symlink_metadata(&candidate) {
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(SCORE_REMOVE_ERROR.to_string()),
    }

    resolve_existing_score_pdf(scores_root, score_id)
        .map(Some)
        .map_err(|_| SCORE_REMOVE_ERROR.to_string())
}
