//! Pure, GUI-independent logic for the BandScope desktop application.
//!
//! The historical desktop-core implementation remains in `lib.rs` as the
//! compatibility module while bounded resource and persistence boundaries are
//! isolated in auditable modules. Public symbols are re-exported so downstream
//! callers keep one canonical crate-root API.

#[path = "lib.rs"]
pub(crate) mod runtime_core;
// Project Persistence still imports `crate::core`; keep that name as a
// crate-private alias to the same compatibility module instead of restoring a
// second crate root or copying Resource Admission ownership.
pub(crate) use runtime_core as core;
mod audio_resource;
mod content_sha256;
mod project_format;
mod publication_identity;
mod score_pdf;
mod source_readmission;

pub use audio_resource::{
    copy_bounded_local_audio, copy_bounded_local_audio_with_receipt,
    validate_local_audio_file_size, verify_local_audio_publication_receipt,
    LocalAudioCopyReceipt, MAX_LOCAL_AUDIO_FILE_BYTES,
};
pub use content_sha256::sha256_hex_reader;
pub use project_format::{
    project_content_for_document, project_content_for_payload, project_document_from_content,
    project_document_from_value, project_payload_from_content,
    project_source_reference_from_publication_identity, ProjectDocumentPayload,
    ProjectPreferencesPayload, ProjectSourceReferencePayload, SelectedPlaybackSourcePayload,
    CURRENT_PROJECT_FORMAT_VERSION,
};
pub use publication_identity::{
    build_local_audio_publication_identity, LocalAudioPublicationIdentity,
};
pub use runtime_core::*;
pub use score_pdf::read_validated_score_pdf;
pub use source_readmission::{
    re_admit_local_audio_publication, re_admit_local_audio_publication_from_project_root,
    ReAdmittedLocalAudioPublication,
};
