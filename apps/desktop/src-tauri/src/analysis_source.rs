use bandscope_desktop_core::{
    project_source_reference_from_publication_identity,
    re_admit_local_audio_publication_from_project_root,
    LocalAudioPublicationIdentity, ProjectBootstrapSummaryPayload,
};
use std::{io::Read, path::Path};

const ANALYSIS_SOURCE_NOT_FOUND: &str =
    "Analysis job source was not found. Choose local audio again.";

/// Re-establish current app-owned source bytes immediately before analysis dispatch.
///
/// Security Notes: the bootstrap path is transient native state, not durable
/// evidence. The retained path-free Resource Admission identity is projected
/// through the Project Persistence ACL, the fixed `source.<extension>` artifact
/// is reopened by the supplied no-follow/reparse-aware native opener, and the
/// current bytes must reproduce the retained bounded size and SHA-256 before
/// they can be sent to the analysis process. OS/file-system details are reduced
/// to the stable buyer-facing re-selection error.
///
/// This narrows the restart-to-dispatch mutation window but does not claim
/// descriptor-to-decoder continuity: the analysis process still opens the
/// returned transient path after this function releases the verified reader.
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

    let mut refreshed = bootstrap.clone();
    refreshed.source.source_path = reopened.source_path.to_string_lossy().into_owned();
    refreshed.source.extension = reopened.identity.extension;
    refreshed.source.file_size_bytes = reopened.identity.file_size_bytes;
    Ok(refreshed)
}
