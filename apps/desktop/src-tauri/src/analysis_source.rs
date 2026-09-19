use bandscope_desktop_core::{
    project_source_reference_from_publication_identity,
    re_admit_local_audio_publication_from_project_root,
    LocalAudioPublicationIdentity, ProjectBootstrapSummaryPayload,
};
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

const ANALYSIS_SOURCE_NOT_FOUND: &str =
    "Analysis job source was not found. Choose local audio again.";

/// Create one non-clobbering local-audio stage without widening Unix permissions through umask.
///
/// Security Notes: the stage path is already constrained to a validated app-owned project root by
/// the caller. Unix requests owner-only mode `0600` at creation so a permissive inherited process
/// umask cannot make the raw rehearsal audio group/world accessible before publication. Non-Unix
/// platforms retain native ACL inheritance. This function creates only the single requested file;
/// it does not acquire source-path authority, publish/replace a destination, or change Resource
/// Admission size/content semantics.
#[cfg(unix)]
pub(crate) fn create_private_local_audio_stage(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;

    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true).mode(0o600);
    options.open(path)
}

/// Create one non-clobbering local-audio stage while preserving native ACL inheritance.
#[cfg(not(unix))]
pub(crate) fn create_private_local_audio_stage(path: &Path) -> std::io::Result<File> {
    File::create_new(path)
}

/// Re-establish current app-owned source bytes immediately before analysis dispatch.
///
/// Security Notes: the bootstrap path is transient native state, not durable
/// evidence. The retained path-free Resource Admission identity is projected
/// through the Project Persistence ACL, the fixed `source.<extension>` artifact
/// is reopened by the supplied no-follow/reparse-aware native opener, and the
/// current bytes must reproduce the retained bounded size and SHA-256 before
/// they can be sent to the analysis process. Cache and temporary workspaces are
/// namespaced by that same canonical digest so a same-path/same-size replacement
/// cannot alias analysis or stem-work artifacts from another content identity.
/// OS/file-system details are reduced to the stable buyer-facing re-selection
/// error. Decoder-byte continuity is completed downstream by the per-process
/// identity handoff and verified snapshot; this adapter does not mint a second
/// content identity.
pub fn revalidate_local_audio_bootstrap_for_analysis<R, F>(
    bootstrap: &ProjectBootstrapSummaryPayload,
    identity: &LocalAudioPublicationIdentity,
    open_file: F,
) -> Result<ProjectBootstrapSummaryPayload, String>
where
    R: Read,
    F: FnOnce(&Path) -> std::io::Result<R>,
{
    if bootstrap.project_id != identity.project_id {
        return Err(ANALYSIS_SOURCE_NOT_FOUND.to_string());
    }

    let reference = project_source_reference_from_publication_identity(identity)
        .map_err(|_| ANALYSIS_SOURCE_NOT_FOUND.to_string())?;
    let reopened = re_admit_local_audio_publication_from_project_root(
        Path::new(&bootstrap.project_root),
        &reference,
        open_file,
    )
    .map_err(|_| ANALYSIS_SOURCE_NOT_FOUND.to_string())?;

    let content_sha256 = reopened.identity.content_sha256.clone();
    let mut refreshed = bootstrap.clone();
    refreshed.source.source_path = reopened.source_path.to_string_lossy().into_owned();
    refreshed.source.extension = reopened.identity.extension;
    refreshed.source.file_size_bytes = reopened.identity.file_size_bytes;
    refreshed.cache_root = Path::new(&bootstrap.cache_root)
        .join(&content_sha256)
        .to_string_lossy()
        .into_owned();
    refreshed.temp_root = Path::new(&bootstrap.temp_root)
        .join(&content_sha256)
        .to_string_lossy()
        .into_owned();
    Ok(refreshed)
}
