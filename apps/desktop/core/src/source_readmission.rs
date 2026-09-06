use crate::{
    audio_resource::{verify_local_audio_publication_receipt, LocalAudioCopyReceipt},
    project_format::ProjectSourceReferencePayload,
    publication_identity::{build_local_audio_publication_identity, LocalAudioPublicationIdentity},
};
use std::{
    ffi::OsStr,
    io::Read,
    path::{Path, PathBuf},
};

const LOCAL_AUDIO_RE_ADMISSION_ERROR: &str = "Could not prepare the local project workspace.";

/// Fresh runtime evidence recovered from one persisted app-owned audio publication.
///
/// `source_path` is transient native authority only. It is derived from the
/// validated BandScope project root plus the fixed Resource Admission artifact
/// name and must never be serialized back into a `.bscope` document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReAdmittedLocalAudioPublication {
    /// Exact app-owned source path that the native opener authorized.
    pub source_path: PathBuf,
    /// Re-established path-free content identity for native state.
    pub identity: LocalAudioPublicationIdentity,
}

fn expected_publication_identity(
    reference: &ProjectSourceReferencePayload,
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
    Ok(expected_identity)
}

fn verify_re_admitted_publication<R: Read>(
    identity: LocalAudioPublicationIdentity,
    reader: R,
) -> Result<LocalAudioPublicationIdentity, String> {
    let expected_receipt = LocalAudioCopyReceipt {
        file_size_bytes: identity.file_size_bytes,
        content_sha256: identity.content_sha256.clone(),
    };
    verify_local_audio_publication_receipt(reader, &expected_receipt)
        .map_err(|_| LOCAL_AUDIO_RE_ADMISSION_ERROR.to_string())?;
    Ok(identity)
}

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
    let expected_identity = expected_publication_identity(reference)?;
    verify_re_admitted_publication(expected_identity, reader)
}

/// Resolve and re-admit one persisted source through a native no-follow opener.
///
/// Security Notes: durable evidence is validated before the opener is invoked,
/// so a forged `artifactName`, extension, digest, size, or project id cannot be
/// turned into a filesystem lookup. The supplied project root must end in the
/// same BandScope project id, and the path is derived from the validated fixed
/// `source.<extension>` artifact name rather than from untrusted path text.
/// `open_file` remains an injected native authority so platform code can enforce
/// O_NOFOLLOW/reparse-point and file-identity rules without duplicating those
/// primitives in this bounded-context ACL. Parent-directory descriptor binding
/// remains the native adapter's responsibility.
pub fn re_admit_local_audio_publication_from_project_root<R, F>(
    project_root: &Path,
    reference: &ProjectSourceReferencePayload,
    open_file: F,
) -> Result<ReAdmittedLocalAudioPublication, String>
where
    R: Read,
    F: FnOnce(&Path) -> std::io::Result<R>,
{
    let expected_identity = expected_publication_identity(reference)?;
    if project_root.file_name() != Some(OsStr::new(&expected_identity.project_id)) {
        return Err(LOCAL_AUDIO_RE_ADMISSION_ERROR.to_string());
    }

    let source_path = project_root.join(&expected_identity.artifact_name);
    let reader = open_file(&source_path)
        .map_err(|_| LOCAL_AUDIO_RE_ADMISSION_ERROR.to_string())?;
    let identity = verify_re_admitted_publication(expected_identity, reader)?;

    Ok(ReAdmittedLocalAudioPublication {
        source_path,
        identity,
    })
}
