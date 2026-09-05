//! Versioned local project document and migration boundary.
//!
//! Version 2 introduces durable project preferences without serializing a
//! revocable runtime playback URL. The existing v1/legacy song parser remains
//! the migration authority for historical inputs; this module owns the current
//! envelope presented to external crate consumers.

use crate::core::{
    project_payload_from_content as project_v1_payload_from_content, RehearsalSongPayload,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Current on-disk project format version, independent of the app version.
pub const CURRENT_PROJECT_FORMAT_VERSION: u16 = 2;

/// Stable playback-source identity stored in project preferences.
///
/// These values describe rehearsal intent. They are resolved against current
/// native availability after reopen and must never contain a
/// `bandscope-playback` authority or filesystem path.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectedPlaybackSourcePayload {
    /// Use the admitted full mix.
    FullMix,
    /// Prefer the currently admitted vocal stem.
    Vocals,
    /// Prefer the currently admitted bass stem.
    Bass,
    /// Prefer the currently admitted drum stem.
    Drums,
    /// Prefer the currently admitted residual/other-instruments stem.
    Other,
}

/// Durable UI preferences that belong to the project rather than a WebView
/// session or localStorage authority.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPreferencesPayload {
    /// Stable playback-source semantic to resolve on reopen.
    pub selected_playback_source: SelectedPlaybackSourcePayload,
}

impl Default for ProjectPreferencesPayload {
    fn default() -> Self {
        Self {
            selected_playback_source: SelectedPlaybackSourcePayload::FullMix,
        }
    }
}

/// Current typed project document after historical migration.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocumentPayload {
    /// Validated rehearsal song compatibility view.
    pub song: RehearsalSongPayload,
    /// Durable project preferences that are safe to persist.
    pub preferences: ProjectPreferencesPayload,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectFileV2Payload {
    project_format_version: u16,
    song: RehearsalSongPayload,
    preferences: ProjectPreferencesPayload,
}

fn unsupported_version(version: u64) -> String {
    format!("Unsupported project format version: {version}")
}

/// Parse a current, v1, or legacy project into the current typed document.
///
/// Security Notes: `.bscope` bytes are untrusted input. Version 2 uses a
/// `deny_unknown_fields` envelope and a closed playback-source enum. Version 1
/// and legacy raw-song inputs are delegated to the existing strict parser and
/// migrated in memory with the explicit `full_mix` default. Unsupported
/// versions fail before their body is interpreted as current truth.
pub fn project_document_from_content(content: &str) -> Result<ProjectDocumentPayload, String> {
    let root = serde_json::from_str::<Value>(content)
        .map_err(|_| "Invalid project file format".to_string())?;

    let Some(version_value) = root.get("projectFormatVersion") else {
        let song = project_v1_payload_from_content(content)?;
        return Ok(ProjectDocumentPayload {
            song,
            preferences: ProjectPreferencesPayload::default(),
        });
    };

    let version = version_value
        .as_u64()
        .ok_or_else(|| "Invalid project file format".to_string())?;

    match version {
        1 => {
            let song = project_v1_payload_from_content(content)?;
            Ok(ProjectDocumentPayload {
                song,
                preferences: ProjectPreferencesPayload::default(),
            })
        }
        2 => {
            let envelope = serde_json::from_value::<ProjectFileV2Payload>(root)
                .map_err(|_| "Invalid project file format".to_string())?;
            if envelope.project_format_version != CURRENT_PROJECT_FORMAT_VERSION {
                return Err(unsupported_version(u64::from(
                    envelope.project_format_version,
                )));
            }
            Ok(ProjectDocumentPayload {
                song: envelope.song,
                preferences: envelope.preferences,
            })
        }
        _ => Err(unsupported_version(version)),
    }
}

/// Compatibility view for callers that currently consume only the song.
///
/// The current reader still accepts v1 and legacy projects through the ordered
/// migration above, while v2 preferences remain available through
/// `project_document_from_content` for the Project Persistence/UI bridge.
pub fn project_payload_from_content(content: &str) -> Result<RehearsalSongPayload, String> {
    project_document_from_content(content).map(|document| document.song)
}

/// Serialize a typed current document as a strict version-2 project envelope.
pub fn project_content_for_document(payload: &ProjectDocumentPayload) -> Result<String, String> {
    serde_json::to_string_pretty(&ProjectFileV2Payload {
        project_format_version: CURRENT_PROJECT_FORMAT_VERSION,
        song: payload.song.clone(),
        preferences: payload.preferences.clone(),
    })
    .map_err(|_| "Failed to serialize project file format".to_string())
}

/// Compatibility writer for callers that currently submit only a song.
///
/// Existing Tauri save callers therefore advance to v2 without inventing a
/// source choice: their deterministic migration default is `full_mix` until
/// the Active Player bridge supplies an explicit stable preference.
pub fn project_content_for_payload(payload: &RehearsalSongPayload) -> Result<String, String> {
    project_content_for_document(&ProjectDocumentPayload {
        song: payload.clone(),
        preferences: ProjectPreferencesPayload::default(),
    })
}
