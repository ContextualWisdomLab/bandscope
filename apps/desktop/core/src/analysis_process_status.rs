//! Parse analysis-process status without leaking native artifact metadata.
//!
//! Python analysis may emit a path-free playable-stem artifact reference for the
//! trusted native process. The renderer status must not carry that reference's
//! hashes, sizes, or storage-derived identity. This module removes and validates
//! the optional native-only field before deserializing the existing public status.

use crate::{
    playable_stem_contract::PlayableStemArtifactSetReference, AnalysisJobState,
    AnalysisJobStatus,
};
use serde_json::Value;

const PROCESS_STATUS_ERROR: &str = "Analysis engine returned an invalid response.";

/// One validated analysis-process status split into public and native-only data.
#[derive(Clone, Debug)]
pub struct AnalysisProcessStatus {
    renderer_status: AnalysisJobStatus,
    playable_stem_artifact_set: Option<PlayableStemArtifactSetReference>,
}

impl AnalysisProcessStatus {
    /// Return the renderer-safe status after native-only metadata was removed.
    pub const fn renderer_status(&self) -> &AnalysisJobStatus {
        &self.renderer_status
    }

    /// Return the optional native-only playable-stem reference.
    pub const fn playable_stem_artifact_set(
        &self,
    ) -> Option<&PlayableStemArtifactSetReference> {
        self.playable_stem_artifact_set.as_ref()
    }

    /// Consume the parsed envelope and return its independently owned parts.
    pub fn into_parts(
        self,
    ) -> (
        AnalysisJobStatus,
        Option<PlayableStemArtifactSetReference>,
    ) {
        (self.renderer_status, self.playable_stem_artifact_set)
    }
}

/// Replace the retained native process envelope with the newest validated status.
///
/// Renderer delivery receives a clone containing only public status fields while
/// native callers keep the complete envelope. Replacing the whole envelope is
/// intentional: a later terminal status without a stem reference must revoke an
/// earlier status's native reference instead of leaving stale metadata eligible
/// for playback-authority binding.
pub fn retain_latest_process_status(
    latest_process_status: &mut Option<AnalysisProcessStatus>,
    process_status: AnalysisProcessStatus,
) -> AnalysisJobStatus {
    let renderer_status = process_status.renderer_status.clone();
    *latest_process_status = Some(process_status);
    renderer_status
}

/// Require a process envelope to belong to the native job that requested it.
pub fn validate_analysis_process_status_for_job(
    process_status: &AnalysisProcessStatus,
    expected_job_id: &str,
) -> Result<(), &'static str> {
    if process_status.renderer_status.job_id == expected_job_id {
        Ok(())
    } else {
        Err(PROCESS_STATUS_ERROR)
    }
}

/// Return whether a validated status is safe to expose as in-flight progress.
///
/// Producer terminal states are withheld until the subprocess exits and the
/// complete JSONL stream is known to be valid. This prevents an early succeeded
/// event from being observed before a later malformed line fails the process.
pub fn is_analysis_process_progress_status(process_status: &AnalysisProcessStatus) -> bool {
    matches!(
        &process_status.renderer_status.state,
        AnalysisJobState::Queued | AnalysisJobState::Running
    )
}

/// Require the process's final retained envelope to be terminal and job-local.
pub fn validate_final_analysis_process_status<'a>(
    process_status: Option<&'a AnalysisProcessStatus>,
    expected_job_id: &str,
) -> Result<&'a AnalysisProcessStatus, &'static str> {
    let process_status = process_status.ok_or(PROCESS_STATUS_ERROR)?;
    validate_analysis_process_status_for_job(process_status, expected_job_id)?;
    if matches!(
        &process_status.renderer_status.state,
        AnalysisJobState::Succeeded | AnalysisJobState::Failed
    ) {
        Ok(process_status)
    } else {
        Err(PROCESS_STATUS_ERROR)
    }
}

/// Parse one stdout JSONL line, ignoring only whitespace-only separators.
///
/// A non-empty malformed line is a process-contract failure. Returning an error
/// instead of skipping it prevents an earlier valid envelope from becoming the
/// apparent final result after corrupted or future producer output.
pub fn parse_analysis_process_status_line(
    process_status_line: &str,
) -> Result<Option<AnalysisProcessStatus>, &'static str> {
    let trimmed = process_status_line.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        parse_analysis_process_status(trimmed).map(Some)
    }
}

/// Parse one JSONL status and isolate its optional native-only artifact reference.
pub fn parse_analysis_process_status(
    process_status_json: &str,
) -> Result<AnalysisProcessStatus, &'static str> {
    let mut process_status_value =
        serde_json::from_str::<Value>(process_status_json).map_err(|_| PROCESS_STATUS_ERROR)?;
    let process_status_object = process_status_value
        .as_object_mut()
        .ok_or(PROCESS_STATUS_ERROR)?;
    let playable_stem_value = process_status_object.remove("playableStemArtifactSet");

    let renderer_status =
        serde_json::from_value::<AnalysisJobStatus>(process_status_value)
            .map_err(|_| PROCESS_STATUS_ERROR)?;
    let playable_stem_artifact_set = playable_stem_value
        .map(serde_json::from_value::<PlayableStemArtifactSetReference>)
        .transpose()
        .map_err(|_| PROCESS_STATUS_ERROR)?;

    let state_payload_is_valid = match &renderer_status.state {
        AnalysisJobState::Succeeded => {
            renderer_status.result.is_some() && renderer_status.error.is_none()
        }
        AnalysisJobState::Failed => {
            renderer_status.result.is_none() && renderer_status.error.is_some()
        }
        AnalysisJobState::Queued | AnalysisJobState::Running => {
            renderer_status.result.is_none() && renderer_status.error.is_none()
        }
    };
    if !state_payload_is_valid {
        return Err(PROCESS_STATUS_ERROR);
    }

    if playable_stem_artifact_set.is_some()
        && !matches!(&renderer_status.state, AnalysisJobState::Succeeded)
    {
        return Err(PROCESS_STATUS_ERROR);
    }

    Ok(AnalysisProcessStatus {
        renderer_status,
        playable_stem_artifact_set,
    })
}
