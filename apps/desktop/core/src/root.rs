//! Pure, GUI-independent logic for the BandScope desktop application.
//!
//! The historical desktop-core implementation remains in `lib.rs` as the
//! compatibility module while bounded score-file I/O is isolated in auditable
//! modules. Public symbols are re-exported so downstream callers keep the same
//! crate-root API.

#[path = "lib.rs"]
mod runtime_core;
mod score_pdf;
mod score_storage;

pub use runtime_core::*;
pub use score_pdf::read_validated_score_pdf;
pub use score_storage::{publish_score_pdf_attachment, remove_score_pdf_attachment};
