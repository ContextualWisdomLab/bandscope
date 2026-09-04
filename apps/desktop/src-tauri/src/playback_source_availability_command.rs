//! Tauri IPC for renderer-safe rehearsal playback source discovery.
//!
//! The renderer supplies only the opaque full-mix authority it already owns. The
//! native process revalidates that authority against the current playback source
//! and returns only opaque handles that can still answer metadata probes.

use crate::playback_protocol::{
    playback_authority_uri, playback_stem_authority_uri, PlaybackAuthority,
    PLAYBACK_AUTHORITY_PREFIX, PLAYBACK_SCHEME,
};
use bandscope_desktop::playback_source_availability::{
    resolve_playback_source_availability, PLAYBACK_SOURCE_AVAILABILITY_ERROR,
};
use bandscope_desktop_core::{is_valid_project_id, playable_stem_contract::PlaybackStemKind};
use std::sync::Arc;
use tauri::http::{Method, Request, StatusCode};

fn project_id_from_full_mix_authority(authority: &str) -> Result<&str, String> {
    let project_id = authority
        .strip_prefix(PLAYBACK_AUTHORITY_PREFIX)
        .filter(|project_id| is_valid_project_id(project_id))
        .ok_or_else(|| PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string())?;
    if playback_authority_uri(project_id).as_deref() != Ok(authority) {
        return Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string());
    }
    Ok(project_id)
}

fn probe_playback_source(
    playback_authority: &PlaybackAuthority,
    authority: &str,
) -> Result<bool, String> {
    let relative = authority
        .strip_prefix(PLAYBACK_AUTHORITY_PREFIX)
        .ok_or_else(|| PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string())?;
    let request = Request::builder()
        .method(Method::HEAD)
        .uri(format!("{PLAYBACK_SCHEME}://localhost/{relative}"))
        .body(Vec::new())
        .map_err(|_| PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string())?;

    match playback_authority.respond(request).status() {
        StatusCode::OK => Ok(true),
        StatusCode::NOT_FOUND => Ok(false),
        _ => Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string()),
    }
}

fn current_playback_source_availability(
    current_full_mix_authority: String,
    playback_authority: &PlaybackAuthority,
) -> Result<Vec<String>, String> {
    let project_id = project_id_from_full_mix_authority(&current_full_mix_authority)?;
    let stem_authority_results = PlaybackStemKind::canonical_order()
        .map(|stem_kind| playback_stem_authority_uri(project_id, stem_kind));
    let [vocals, bass, drums, other] = stem_authority_results;
    let stem_authorities = [vocals?, bass?, drums?, other?];

    resolve_playback_source_availability(
        current_full_mix_authority,
        stem_authorities,
        |authority| probe_playback_source(playback_authority, authority),
    )
}

/// Return the current full mix and, only when atomically available, all four
/// generated stem authorities. Native paths, hashes and file identities never
/// cross this IPC boundary.
#[tauri::command]
pub fn get_playback_source_availability(
    current_full_mix_authority: String,
    playback_authority: tauri::State<'_, Arc<PlaybackAuthority>>,
) -> Result<Vec<String>, String> {
    current_playback_source_availability(
        current_full_mix_authority,
        playback_authority.inner().as_ref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use bandscope_desktop_core::LocalAudioSourcePayload;
    use std::{path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

    fn test_source() -> (PathBuf, LocalAudioSourcePayload) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be after the Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "bandscope-source-availability-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("test root should be created");
        let path = root.join("source.wav");
        std::fs::write(&path, b"audio").expect("test source should be written");
        let canonical = path.canonicalize().expect("test source should canonicalize");
        (
            root,
            LocalAudioSourcePayload {
                source_path: canonical.to_string_lossy().into_owned(),
                file_name: "source.wav".to_string(),
                extension: "wav".to_string(),
                file_size_bytes: 5,
            },
        )
    }

    #[test]
    fn current_full_mix_is_discoverable_without_exposing_native_source_data() {
        let (root, source) = test_source();
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-700-1", &source)
            .expect("test source should activate");
        let handle = playback_authority_uri("project-700-1")
            .expect("test project should mint an authority");

        let available = current_playback_source_availability(handle.clone(), &authority)
            .expect("current full mix should be discoverable");

        assert_eq!(available, vec![handle]);
        assert!(available.iter().all(|value| !value.contains(root.to_string_lossy().as_ref())));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn stale_or_path_shaped_full_mix_authority_fails_closed() {
        let (root, source) = test_source();
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-710-1", &source)
            .expect("test source should activate");

        for candidate in [
            "bandscope-project://project-709-1",
            "bandscope-project://project-710-1/stem/vocals",
            "file:///private/source.wav",
        ] {
            assert_eq!(
                current_playback_source_availability(candidate.to_string(), &authority).as_deref(),
                Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR),
                "{candidate} must not discover current native authority"
            );
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn mutated_full_mix_is_not_reported_as_available() {
        let (root, source) = test_source();
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-720-1", &source)
            .expect("test source should activate");
        let handle = playback_authority_uri("project-720-1")
            .expect("test project should mint an authority");
        std::fs::write(&source.source_path, b"other")
            .expect("test source should be mutated in place");

        assert_eq!(
            current_playback_source_availability(handle, &authority).as_deref(),
            Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR)
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
