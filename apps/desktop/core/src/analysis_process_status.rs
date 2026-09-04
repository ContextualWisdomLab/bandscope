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

    if playable_stem_artifact_set.is_some()
        && (!matches!(&renderer_status.state, AnalysisJobState::Succeeded)
            || renderer_status.result.is_none()
            || renderer_status.error.is_some())
    {
        return Err(PROCESS_STATUS_ERROR);
    }

    Ok(AnalysisProcessStatus {
        renderer_status,
        playable_stem_artifact_set,
    })
}
