//! Versioned local project document and migration boundary.
//!
//! Version 2 introduced durable project preferences without serializing a
//! revocable runtime playback URL. Version 3 adds an app-owned audio source
//! reference that contains no user filesystem path. The existing v1/legacy
//! song parser remains the migration authority for historical inputs; this
//! module owns the current envelope presented to external crate consumers.

use crate::core::{
    is_valid_project_id, project_payload_from_content as project_v1_payload_from_content,
    RehearsalSongPayload, AUDIO_EXTENSIONS,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Current on-disk project format version, independent of the app version.
pub const CURRENT_PROJECT_FORMAT_VERSION: u16 = 3;

/// Maximum admitted full-mix bytes a durable source reference may claim.
///
/// This mirrors the current Resource Admission ceiling so an untrusted project
/// document cannot turn an impossible source identity into restart authority.
/// Once the #866 foundation enters this branch's ancestry, consume its exported
/// canonical constant instead of maintaining two declarations.
const MAX_PROJECT_SOURCE_REFERENCE_BYTES: u64 = 100 * 1024 * 1024;

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

/// Durable handle for the app-owned full-mix artifact needed after process
/// restart.
///
/// The reference deliberately stores no absolute/relative user path. Native
/// Resource Admission derives the artifact location from `project_id` and the
/// fixed `source.<extension>` artifact name, then re-validates byte length and
/// SHA-256 content identity before issuing any fresh runtime authority.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectSourceReferencePayload {
    /// Opaque app-owned project namespace identifier.
    pub project_id: String,
    /// Fixed app-owned artifact basename, for example `source.wav`.
    pub artifact_name: String,
    /// Closed audio extension admitted by BandScope.
    pub extension: String,
    /// Expected non-zero byte length used as bounded re-admission evidence.
    pub file_size_bytes: u64,
    /// Canonical lowercase SHA-256 digest of the admitted app-owned audio bytes.
    pub content_sha256: String,
}

/// Current typed project document after historical migration.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectDocumentPayload {
    /// Validated rehearsal song compatibility view.
    pub song: RehearsalSongPayload,
    /// Durable project preferences that are safe to persist.
    pub preferences: ProjectPreferencesPayload,
    /// Optional app-owned source reference. Historical projects migrate with
    /// this absent rather than inventing source authority.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_reference: Option<ProjectSourceReferencePayload>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectFileV2Payload {
    project_format_version: u16,
    song: RehearsalSongPayload,
    preferences: ProjectPreferencesPayload,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectFileV3Payload {
    project_format_version: u16,
    song: RehearsalSongPayload,
    preferences: ProjectPreferencesPayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_reference: Option<ProjectSourceReferencePayload>,
}

fn unsupported_version(version: u64) -> String {
    format!("Unsupported project format version: {version}")
}

fn sha256_hex_is_canonical(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn source_reference_is_valid(reference: &ProjectSourceReferencePayload) -> bool {
    if !is_valid_project_id(&reference.project_id)
        || reference.file_size_bytes == 0
        || reference.file_size_bytes > MAX_PROJECT_SOURCE_REFERENCE_BYTES
        || !AUDIO_EXTENSIONS.contains(&reference.extension.as_str())
        || !sha256_hex_is_canonical(&reference.content_sha256)
    {
        return false;
    }

    let expected_artifact_name = format!("source.{}", reference.extension);
    reference.artifact_name == expected_artifact_name
}

fn validate_document(document: ProjectDocumentPayload) -> Result<ProjectDocumentPayload, String> {
    if document
        .source_reference
        .as_ref()
        .is_some_and(|reference| !source_reference_is_valid(reference))
    {
        return Err("Invalid project document payload".to_string());
    }
    Ok(document)
}

/// Admit a renderer-supplied current project document before publication.
///
/// Security Notes: renderer IPC values are untrusted. The document, nested
/// preferences, stable playback-source enum, and rehearsal-song DTO use typed
/// allowlists/`deny_unknown_fields`. Renderer-supplied `sourceReference` is
/// rejected even when structurally valid because filesystem byte identity and
/// digest evidence must come from native Resource Admission state. After #866
/// enters this branch's ancestry, the Tauri persistence adapter may inject that
/// verified native identity before serialization; renderer JSON never authors
/// filesystem paths, artifact identity, byte evidence, or playback authority.
pub fn project_document_from_value(value: Value) -> Result<ProjectDocumentPayload, String> {
    let document = serde_json::from_value::<ProjectDocumentPayload>(value)
        .map_err(|_| "Invalid project document payload".to_string())?;
    if document.source_reference.is_some() {
        return Err("Invalid project document payload".to_string());
    }
    validate_document(document)
}

/// Parse a current, v2, v1, or legacy project into the current typed document.
///
/// Security Notes: `.bscope` bytes are untrusted input. Versions 2 and 3 use
/// `deny_unknown_fields` envelopes and closed playback-source semantics.
/// Version 3 additionally validates the app-owned source reference without
/// accepting any user filesystem path and requires canonical SHA-256 content
/// identity plus a byte length within Resource Admission's ceiling so byte
/// length alone can never be treated as sufficient re-admission evidence.
/// Version 1 and legacy raw-song inputs are delegated to the existing strict
/// parser and migrated in memory with the explicit `full_mix` default and no
/// invented source reference. Unsupported versions fail before their body is
/// interpreted as current truth.
pub fn project_document_from_content(content: &str) -> Result<ProjectDocumentPayload, String> {
    let root = serde_json::from_str::<Value>(content)
        .map_err(|_| "Invalid project file format".to_string())?;

    let Some(version_value) = root.get("projectFormatVersion") else {
        let song = project_v1_payload_from_content(content)?;
        return Ok(ProjectDocumentPayload {
            song,
            preferences: ProjectPreferencesPayload::default(),
            source_reference: None,
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
                source_reference: None,
            })
        }
        2 => {
            let envelope = serde_json::from_value::<ProjectFileV2Payload>(root)
                .map_err(|_| "Invalid project file format".to_string())?;
            if envelope.project_format_version != 2 {
                return Err(unsupported_version(u64::from(
                    envelope.project_format_version,
                )));
            }
            Ok(ProjectDocumentPayload {
                song: envelope.song,
                preferences: envelope.preferences,
                source_reference: None,
            })
        }
        3 => {
            let envelope = serde_json::from_value::<ProjectFileV3Payload>(root)
                .map_err(|_| "Invalid project file format".to_string())?;
            if envelope.project_format_version != CURRENT_PROJECT_FORMAT_VERSION {
                return Err(unsupported_version(u64::from(
                    envelope.project_format_version,
                )));
            }
            validate_document(ProjectDocumentPayload {
                song: envelope.song,
                preferences: envelope.preferences,
                source_reference: envelope.source_reference,
            })
            .map_err(|_| "Invalid project file format".to_string())
        }
        _ => Err(unsupported_version(version)),
    }
}

/// Compatibility view for callers that currently consume only the song.
///
/// The current reader still accepts v1, v2, and legacy projects through the
/// ordered migration above, while current preferences/source references remain
/// available through `project_document_from_content` for the Project
/// Persistence/UI bridge.
pub fn project_payload_from_content(content: &str) -> Result<RehearsalSongPayload, String> {
    project_document_from_content(content).map(|document| document.song)
}

/// Serialize a typed current document as a strict version-3 project envelope.
pub fn project_content_for_document(payload: &ProjectDocumentPayload) -> Result<String, String> {
    if payload
        .source_reference
        .as_ref()
        .is_some_and(|reference| !source_reference_is_valid(reference))
    {
        return Err("Invalid project document payload".to_string());
    }

    serde_json::to_string_pretty(&ProjectFileV3Payload {
        project_format_version: CURRENT_PROJECT_FORMAT_VERSION,
        song: payload.song.clone(),
        preferences: payload.preferences.clone(),
        source_reference: payload.source_reference.clone(),
    })
    .map_err(|_| "Failed to serialize project file format".to_string())
}

/// Compatibility writer for callers that currently submit only a song.
///
/// Existing Tauri save callers therefore advance to v3 without inventing a
/// source choice or source reference: their deterministic migration default is
/// `full_mix` and an absent source reference until Resource Admission supplies
/// an explicit app-owned artifact identity.
pub fn project_content_for_payload(payload: &RehearsalSongPayload) -> Result<String, String> {
    project_content_for_document(&ProjectDocumentPayload {
        song: payload.clone(),
        preferences: ProjectPreferencesPayload::default(),
        source_reference: None,
    })
}
