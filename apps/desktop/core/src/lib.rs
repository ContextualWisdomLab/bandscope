//! Public crate root for GUI-independent BandScope desktop logic.
//!
//! The historical payload/process surface remains in `core`; Project
//! Persistence format evolution is isolated in `project_format` so durable
//! migration rules do not become another renderer or Tauri storage authority.

mod core;
mod project_format;

pub use core::*;
pub use project_format::{
    project_content_for_document, project_content_for_payload, project_document_from_content,
    project_payload_from_content, ProjectDocumentPayload, ProjectPreferencesPayload,
    SelectedPlaybackSourcePayload, CURRENT_PROJECT_FORMAT_VERSION,
};
