//! Pure, GUI-independent logic for the BandScope desktop application.
//!
//! The historical desktop-core implementation remains in `lib.rs` as the
//! compatibility module while bounded score-file I/O is isolated in auditable
//! modules. Public symbols are re-exported so downstream callers keep the same
//! crate-root API.

#[cfg(all(feature = "score-storage-fault-injection", not(debug_assertions)))]
compile_error!(
    "score-storage-fault-injection is owner-test instrumentation and must not be enabled in release builds"
);

#[path = "lib.rs"]
mod runtime_core;
mod content_sha256;
mod score_pdf;
mod score_publication;
mod score_recovery;
mod score_retention;
mod score_storage;

pub use content_sha256::sha256_hex_reader;
pub use runtime_core::*;
pub use score_pdf::read_validated_score_pdf;
pub use score_recovery::{
    inventory_published_score_pdf_ids, inventory_published_score_pdf_receipts,
    publish_score_pdf_attachment, remove_score_pdf_attachment_if_receipt_matches,
    PublishedScorePdfReceipt,
};
pub use score_retention::resolve_score_pdf_for_removal;
pub use score_storage::remove_score_pdf_attachment;
