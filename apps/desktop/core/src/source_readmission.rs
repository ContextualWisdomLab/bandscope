use crate::{
    audio_resource::{verify_local_audio_publication_receipt, LocalAudioCopyReceipt},
    project_format::ProjectSourceReferencePayload,
    publication_identity::{build_local_audio_publication_identity, LocalAudioPublicationIdentity},
};
use std::io::Read;

const LOCAL_AUDIO_RE_ADMISSION_ERROR: &str = "Could not prepare the local project workspace.";

/// Re-establish native content identity for a persisted app-owned full-mix artifact.
///
/// Security Notes: `ProjectSourceReferencePayload` is durable evidence, not runtime
/// filesystem authority. This reverse ACL validates the reference through the
/// Resource Admission identity builder before reading, then hashes no more than
/// the persisted byte length plus the verifier's one-byte growth probe. Runtime
/// authority is returned only when the opened app-owned stream reproduces both
/// the exact byte count and SHA-256 digest. Paths and playback capabilities are
/// intentionally absent from this boundary; the native adapter remains
/// responsible for deriving and opening only `source.<extension>` below the
/// validated BandScope project root.
pub fn re_admit_local_audio_publication<R: Read>(
    reference: &ProjectSourceReferencePayload,
    reader: R,
) -> Result<LocalAudioPublicationIdentity, String> {
    let expected_receipt = LocalAudioCopyReceipt {
        file_size_bytes: reference.file_size_bytes,
        content_sha256: reference.content_sha256.clone(),
    };
    let expected_identity = build_local_audio_publication_identity(
        &reference.project_id,
        &reference.extension,
        &expected_receipt,
    )
    .map_err(|_| LOCAL_AUDIO_RE_ADMISSION_ERROR.to_string())?;
    if expected_identity.artifact_name != reference.artifact_name {
        return Err(LOCAL_AUDIO_RE_ADMISSION_ERROR.to_string());
    }

    verify_local_audio_publication_receipt(reader, &expected_receipt)
        .map_err(|_| LOCAL_AUDIO_RE_ADMISSION_ERROR.to_string())?;
    Ok(expected_identity)
}
