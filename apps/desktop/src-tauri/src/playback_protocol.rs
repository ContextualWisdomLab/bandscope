//! Revocable native media authority for the mounted rehearsal player.
//!
//! The WebView receives only app-minted opaque identifiers. Native source paths
//! stay behind this protocol boundary and every request is checked against the
//! one currently active project before BandScope opens any file.

use bandscope_desktop::{
    native_file_identity::{native_file_identity, NativeFileIdentity},
    playable_stem_admission::PreflightPlayableStemSet,
};
use bandscope_desktop_core::{
    is_valid_project_id, playable_stem_contract::PlaybackStemKind, LocalAudioSourcePayload,
};
use std::{
    collections::BTreeMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::http::{
    header::{ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE},
    Method, Request, Response, StatusCode,
};

/// Custom scheme used only for current-project audio playback.
pub const PLAYBACK_SCHEME: &str = "bandscope-playback";

/// Opaque renderer-side handle prefix. The suffix is an app-minted project id,
/// never a native path or user-controlled URL.
pub const PLAYBACK_AUTHORITY_PREFIX: &str = "bandscope-project://";

/// Match Tauri's bounded single-range chunk size so media seeks do not allocate
/// an arbitrarily large buffer from an untrusted Range header.
const MAX_RANGE_BYTES: u64 = 1_000 * 1024;

#[derive(Clone, Debug)]
struct PlaybackFileAuthority {
    source_path: PathBuf,
    extension: String,
    expected_size: u64,
    source_identity: NativeFileIdentity,
}

#[derive(Clone, Debug)]
struct PlaybackSourceAuthority {
    project_id: String,
    full_mix: PlaybackFileAuthority,
    stem_analysis_job_id: Option<String>,
    playable_stems: Option<BTreeMap<PlaybackStemKind, PlaybackFileAuthority>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PlaybackRequestSource {
    FullMix,
    Stem(PlaybackStemKind),
}

/// Process-local authority for the one audio source currently admitted to the
/// rehearsal player. Replacing it revokes the full mix, any in-flight stem
/// generation token, and every stem registered for the previous source.
#[derive(Default)]
pub struct PlaybackAuthority {
    current: Mutex<Option<PlaybackSourceAuthority>>,
}

/// Return the renderer-visible full-mix handle for an app-minted playback project.
pub fn playback_authority_uri(project_id: &str) -> Result<String, String> {
    if !is_valid_project_id(project_id) {
        return Err("Could not prepare the selected audio for playback.".to_string());
    }
    Ok(format!("{PLAYBACK_AUTHORITY_PREFIX}{project_id}"))
}

/// Return an opaque generated-stem handle without exposing a native path.
pub fn playback_stem_authority_uri(
    project_id: &str,
    stem_kind: PlaybackStemKind,
) -> Result<String, String> {
    if !is_valid_project_id(project_id) {
        return Err("Could not prepare generated stems for playback.".to_string());
    }
    Ok(format!(
        "{PLAYBACK_AUTHORITY_PREFIX}{project_id}/stem/{}",
        stem_slug(stem_kind)
    ))
}

impl PlaybackAuthority {
    /// Replace the current playback source with an already validated native
    /// source. The project id is app-minted and never derived from a path.
    pub fn activate(&self, project_id: &str, source: &LocalAudioSourcePayload) -> Result<(), String> {
        if !is_valid_project_id(project_id) {
            return Err("Could not prepare the selected audio for playback.".to_string());
        }
        let source_path = PathBuf::from(&source.source_path);
        let (file, _) = open_validated_source(&source_path, source.file_size_bytes)
            .map_err(|_| "Could not prepare the selected audio for playback.".to_string())?;
        let source_identity = native_file_identity(&file)
            .map_err(|_| "Could not prepare the selected audio for playback.".to_string())?;
        let mut current = self
            .current
            .lock()
            .map_err(|_| "Could not prepare the selected audio for playback.".to_string())?;
        *current = Some(PlaybackSourceAuthority {
            project_id: project_id.to_string(),
            full_mix: PlaybackFileAuthority {
                source_path,
                extension: source.extension.clone(),
                expected_size: source.file_size_bytes,
                source_identity,
            },
            stem_analysis_job_id: None,
            playable_stems: None,
        });
        Ok(())
    }

    /// Mark a newly queued analysis as the only job allowed to register stems
    /// for the current project and revoke any older generated stem set.
    pub fn begin_stem_analysis(&self, project_id: &str, job_id: &str) -> Result<(), String> {
        if !is_valid_project_id(project_id) || job_id.is_empty() {
            return Err("Could not prepare generated stems for playback.".to_string());
        }
        let mut current = self
            .current
            .lock()
            .map_err(|_| "Could not prepare generated stems for playback.".to_string())?;
        let authority = current
            .as_mut()
            .filter(|entry| entry.project_id == project_id)
            .ok_or_else(|| "Could not prepare generated stems for playback.".to_string())?;
        authority.stem_analysis_job_id = Some(job_id.to_string());
        authority.playable_stems = None;
        Ok(())
    }

    /// Atomically bind a complete native-preflighted stem set to the current
    /// project, but only if the same analysis job is still the latest owner.
    ///
    /// File identities come from the exact handles whose bytes passed hash/header
    /// preflight. No producer path is accepted and partial registration is impossible.
    pub fn activate_stems(
        &self,
        project_id: &str,
        job_id: &str,
        preflight: &PreflightPlayableStemSet,
    ) -> Result<(), String> {
        if !is_valid_project_id(project_id) || job_id.is_empty() {
            return Err("Could not prepare generated stems for playback.".to_string());
        }
        let mut sources = BTreeMap::new();
        for file in preflight.files() {
            if sources
                .insert(
                    file.stem_kind(),
                    PlaybackFileAuthority {
                        source_path: file.native_path().to_path_buf(),
                        extension: "wav".to_string(),
                        expected_size: file.file_size_bytes(),
                        source_identity: file.file_identity().clone(),
                    },
                )
                .is_some()
            {
                return Err("Could not prepare generated stems for playback.".to_string());
            }
        }
        if sources.len() != PlaybackStemKind::canonical_order().len()
            || PlaybackStemKind::canonical_order()
                .into_iter()
                .any(|stem_kind| !sources.contains_key(&stem_kind))
        {
            return Err("Could not prepare generated stems for playback.".to_string());
        }

        let mut current = self
            .current
            .lock()
            .map_err(|_| "Could not prepare generated stems for playback.".to_string())?;
        let authority = current
            .as_mut()
            .filter(|entry| entry.project_id == project_id)
            .filter(|entry| entry.stem_analysis_job_id.as_deref() == Some(job_id))
            .ok_or_else(|| "Could not prepare generated stems for playback.".to_string())?;
        authority.playable_stems = Some(sources);
        Ok(())
    }

    /// Serve GET/HEAD media requests only when their opaque project/source token
    /// still belongs to the current authority. Missing or revoked stems return 404.
    pub fn respond(&self, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        let Some((project_id, requested_source)) = playback_request_source(request.uri().path()) else {
            return empty_response(StatusCode::NOT_FOUND);
        };
        self.with_current_authority(project_id, |authority| {
            if request.method() != Method::GET && request.method() != Method::HEAD {
                return Some(empty_response(StatusCode::METHOD_NOT_ALLOWED));
            }
            let source = match requested_source {
                PlaybackRequestSource::FullMix => &authority.full_mix,
                PlaybackRequestSource::Stem(stem_kind) => {
                    authority.playable_stems.as_ref()?.get(&stem_kind)?
                }
            };
            Some(serve_authorized_source(source, &request))
        })
        .flatten()
        .unwrap_or_else(|| empty_response(StatusCode::NOT_FOUND))
    }

    fn with_current_authority<R>(
        &self,
        project_id: &str,
        use_authority: impl FnOnce(&PlaybackSourceAuthority) -> R,
    ) -> Option<R> {
        if !is_valid_project_id(project_id) {
            return None;
        }
        let current = self.current.lock().ok()?;
        let authority = current
            .as_ref()
            .filter(|entry| entry.project_id == project_id)?;
        Some(use_authority(authority))
    }
}

fn stem_slug(stem_kind: PlaybackStemKind) -> &'static str {
    match stem_kind {
        PlaybackStemKind::Vocals => "vocals",
        PlaybackStemKind::Bass => "bass",
        PlaybackStemKind::Drums => "drums",
        PlaybackStemKind::Other => "other",
    }
}

fn stem_kind_from_slug(value: &str) -> Option<PlaybackStemKind> {
    match value {
        "vocals" => Some(PlaybackStemKind::Vocals),
        "bass" => Some(PlaybackStemKind::Bass),
        "drums" => Some(PlaybackStemKind::Drums),
        "other" => Some(PlaybackStemKind::Other),
        _ => None,
    }
}

fn playback_request_source(path: &str) -> Option<(&str, PlaybackRequestSource)> {
    let relative = path.strip_prefix('/')?;
    if relative.is_empty() || relative.contains('%') {
        return None;
    }
    let mut parts = relative.split('/');
    let project_id = parts.next()?;
    if !is_valid_project_id(project_id) {
        return None;
    }
    match (parts.next(), parts.next(), parts.next()) {
        (None, None, None) => Some((project_id, PlaybackRequestSource::FullMix)),
        (Some("stem"), Some(stem_slug), None) => Some((
            project_id,
            PlaybackRequestSource::Stem(stem_kind_from_slug(stem_slug)?),
        )),
        _ => None,
    }
}

fn content_type(extension: &str) -> Option<&'static str> {
    match extension {
        "wav" => Some("audio/wav"),
        "mp3" => Some("audio/mpeg"),
        "flac" => Some("audio/flac"),
        "m4a" => Some("audio/mp4"),
        _ => None,
    }
}

fn open_validated_source(source_path: &Path, expected_size: u64) -> Result<(File, u64), StatusCode> {
    let link_metadata = std::fs::symlink_metadata(source_path).map_err(|_| StatusCode::GONE)?;
    if link_metadata.file_type().is_symlink()
        || !link_metadata.is_file()
        || link_metadata.len() != expected_size
    {
        return Err(StatusCode::GONE);
    }
    let canonical = source_path.canonicalize().map_err(|_| StatusCode::GONE)?;
    if canonical != source_path {
        return Err(StatusCode::GONE);
    }
    let file = File::open(&canonical).map_err(|_| StatusCode::GONE)?;
    let metadata = file.metadata().map_err(|_| StatusCode::GONE)?;
    if !metadata.is_file() || metadata.len() != expected_size || metadata.len() == 0 {
        return Err(StatusCode::GONE);
    }
    Ok((file, metadata.len()))
}

fn validated_file(authority: &PlaybackFileAuthority) -> Result<(File, u64), StatusCode> {
    let (file, len) = open_validated_source(&authority.source_path, authority.expected_size)?;
    let current_identity = native_file_identity(&file).map_err(|_| StatusCode::GONE)?;
    if current_identity != authority.source_identity {
        return Err(StatusCode::GONE);
    }
    Ok((file, len))
}

fn serve_authorized_source(
    authority: &PlaybackFileAuthority,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let Some(media_type) = content_type(&authority.extension) else {
        return empty_response(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };
    let (mut file, len) = match validated_file(authority) {
        Ok(value) => value,
        Err(status) => return empty_response(status),
    };

    if request.method() == Method::HEAD {
        return Response::builder()
            .status(StatusCode::OK)
            .header(ACCEPT_RANGES, "bytes")
            .header(CONTENT_TYPE, media_type)
            .header(CONTENT_LENGTH, len)
            .body(Vec::new())
            .expect("static playback HEAD response should build");
    }

    let range_header = request.headers().get(RANGE).and_then(|value| value.to_str().ok());
    if let Some(range_header) = range_header {
        let (start, end) = match parse_single_range(range_header, len) {
            Ok(range) => range,
            Err(()) => return range_not_satisfiable(len),
        };
        let byte_count = end + 1 - start;
        let Ok(capacity) = usize::try_from(byte_count) else {
            return range_not_satisfiable(len);
        };
        if file.seek(SeekFrom::Start(start)).is_err() {
            return empty_response(StatusCode::GONE);
        }
        let mut body = Vec::with_capacity(capacity);
        if file.take(byte_count).read_to_end(&mut body).is_err() || body.len() != capacity {
            return empty_response(StatusCode::GONE);
        }
        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(ACCEPT_RANGES, "bytes")
            .header(CONTENT_TYPE, media_type)
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(CONTENT_LENGTH, byte_count)
            .body(body)
            .expect("static playback range response should build");
    }

    // Tauri custom-protocol bodies are buffered. Keep tiny compatibility GETs,
    // but require large media clients to use the bounded Range path above.
    if len > MAX_RANGE_BYTES {
        return range_not_satisfiable(len);
    }

    let mut body = Vec::new();
    if file.read_to_end(&mut body).is_err() || body.len() as u64 != len {
        return empty_response(StatusCode::GONE);
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_TYPE, media_type)
        .header(CONTENT_LENGTH, len)
        .body(body)
        .expect("static playback response should build")
}

fn parse_single_range(header: &str, len: u64) -> Result<(u64, u64), ()> {
    if len == 0 {
        return Err(());
    }
    let value = header.strip_prefix("bytes=").ok_or(())?.trim();
    if value.is_empty() || value.contains(',') {
        return Err(());
    }

    if let Some(suffix) = value.strip_prefix('-') {
        let suffix_len = suffix.parse::<u64>().map_err(|_| ())?;
        if suffix_len == 0 {
            return Err(());
        }
        let bounded_suffix = suffix_len.min(len).min(MAX_RANGE_BYTES);
        return Ok((len - bounded_suffix, len - 1));
    }

    let (start, end) = value.split_once('-').ok_or(())?;
    let start = start.parse::<u64>().map_err(|_| ())?;
    if start >= len {
        return Err(());
    }
    let requested_end = if end.is_empty() {
        len - 1
    } else {
        end.parse::<u64>().map_err(|_| ())?.min(len - 1)
    };
    if requested_end < start {
        return Err(());
    }
    let end = requested_end.min(start.saturating_add(MAX_RANGE_BYTES - 1));
    Ok((start, end))
}

fn range_not_satisfiable(len: u64) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_RANGE, format!("bytes */{len}"))
        .body(Vec::new())
        .expect("static playback range error should build")
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("static playback error response should build")
}

#[cfg(test)]
mod tests {
    use super::*;
    use bandscope_desktop::playable_stem_admission::preflight_playable_stem_set;
    use bandscope_desktop_core::playable_stem_contract::PlayableStemArtifactSetReference;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    const STEM_ARTIFACT_SET_ID: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const SINGLE_SAMPLE_WAVE_SHA256: &str =
        "4aebda3a657a0d8f532d11ceacb1679081d7bdf7d7d301a53f1096af3580be91";

    fn test_source(label: &str, bytes: &[u8]) -> (PathBuf, LocalAudioSourcePayload) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be after the Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "bandscope-playback-{}-{label}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("test playback root should be created");
        let path = root.join("source.wav");
        std::fs::write(&path, bytes).expect("test playback source should be written");
        let canonical = path.canonicalize().expect("test source should canonicalize");
        let source = LocalAudioSourcePayload {
            source_path: canonical.to_string_lossy().into_owned(),
            file_name: "source.wav".to_string(),
            extension: "wav".to_string(),
            file_size_bytes: bytes.len() as u64,
        };
        (root, source)
    }

    fn single_sample_wave() -> Vec<u8> {
        vec![
            0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
            0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
            0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
            0x61, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]
    }

    fn preflight_stem_fixture(label: &str) -> (PathBuf, PreflightPlayableStemSet) {
        let (root, _) = test_source(label, b"full-mix");
        let set_root = root
            .join("playable-stems-v1")
            .join(STEM_ARTIFACT_SET_ID);
        std::fs::create_dir_all(&set_root).expect("test stem set root should be created");
        let wave = single_sample_wave();
        for stem_kind in PlaybackStemKind::canonical_order() {
            std::fs::write(set_root.join(stem_kind.file_name()), &wave)
                .expect("test stem should be written");
        }
        let stem_artifacts = PlaybackStemKind::canonical_order()
            .into_iter()
            .map(|stem_kind| {
                json!({
                    "artifactId": stem_kind.artifact_id(),
                    "stemKind": stem_slug(stem_kind),
                    "fileSizeBytes": wave.len(),
                    "contentHashSha256": SINGLE_SAMPLE_WAVE_SHA256,
                    "mediaType": "audio/wav",
                    "sampleRate": 8_000,
                    "channelCount": 1,
                    "sampleCount": 1,
                    "durationSeconds": 0.000125
                })
            })
            .collect::<Vec<_>>();
        let reference = serde_json::from_value::<PlayableStemArtifactSetReference>(json!({
            "artifactSetId": STEM_ARTIFACT_SET_ID,
            "formatVersion": 1,
            "sampleRate": 8_000,
            "channelCount": 1,
            "sampleCount": 1,
            "durationSeconds": 0.000125,
            "appliedGain": 1.0,
            "stemArtifacts": stem_artifacts
        }))
        .expect("test stem reference should satisfy the contract");
        let preflight = preflight_playable_stem_set(&root, &reference)
            .expect("test stem files should pass native preflight");
        (root, preflight)
    }

    fn request(project_id: &str) -> Request<Vec<u8>> {
        Request::builder()
            .uri(format!("{PLAYBACK_SCHEME}://localhost/{project_id}"))
            .body(Vec::new())
            .expect("test request should build")
    }

    fn stem_request(project_id: &str, stem_kind: PlaybackStemKind) -> Request<Vec<u8>> {
        Request::builder()
            .uri(format!(
                "{PLAYBACK_SCHEME}://localhost/{project_id}/stem/{}",
                stem_slug(stem_kind)
            ))
            .body(Vec::new())
            .expect("test stem request should build")
    }

    #[test]
    fn renderer_handles_contain_only_app_minted_ids_and_canonical_stem_tokens() {
        assert_eq!(
            playback_authority_uri("project-100-1").as_deref(),
            Ok("bandscope-project://project-100-1")
        );
        assert_eq!(
            playback_stem_authority_uri("project-100-1", PlaybackStemKind::Vocals).as_deref(),
            Ok("bandscope-project://project-100-1/stem/vocals")
        );
        assert!(playback_authority_uri("../../private.wav").is_err());
    }

    #[test]
    fn rotating_authority_revokes_the_previous_project_immediately() {
        let (first_root, first_source) = test_source("first", b"first-audio");
        let (second_root, second_source) = test_source("second", b"second-audio");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-100-1", &first_source)
            .expect("first source should activate");
        assert_eq!(
            authority.respond(request("project-100-1")).status(),
            StatusCode::OK
        );

        authority
            .activate("project-101-2", &second_source)
            .expect("second source should activate");

        assert_eq!(
            authority.respond(request("project-100-1")).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            authority.respond(request("project-101-2")).body(),
            b"second-audio"
        );
        let _ = std::fs::remove_dir_all(first_root);
        let _ = std::fs::remove_dir_all(second_root);
    }

    #[test]
    fn preflighted_stems_bind_and_serve_all_four_files_atomically() {
        let (root, source) = test_source("stem-bind-full", b"full-mix");
        let (stem_root, preflight) = preflight_stem_fixture("stem-bind");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-125-1", &source)
            .expect("full mix should activate");
        authority
            .begin_stem_analysis("project-125-1", "job-10")
            .expect("current analysis should own stem registration");
        authority
            .activate_stems("project-125-1", "job-10", &preflight)
            .expect("complete preflighted stems should bind");

        for stem_kind in PlaybackStemKind::canonical_order() {
            assert_eq!(
                authority.respond(stem_request("project-125-1", stem_kind)).body(),
                &single_sample_wave()
            );
        }
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(stem_root);
    }

    #[test]
    fn older_same_project_job_cannot_overwrite_a_newer_stem_generation() {
        let (root, source) = test_source("stem-race-full", b"full-mix");
        let (stem_root, preflight) = preflight_stem_fixture("stem-race");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-130-1", &source)
            .expect("full mix should activate");
        authority
            .begin_stem_analysis("project-130-1", "job-10")
            .expect("first analysis should begin");
        authority
            .begin_stem_analysis("project-130-1", "job-11")
            .expect("newer analysis should supersede the first");

        assert!(authority
            .activate_stems("project-130-1", "job-10", &preflight)
            .is_err());
        assert_eq!(
            authority
                .respond(stem_request("project-130-1", PlaybackStemKind::Vocals))
                .status(),
            StatusCode::NOT_FOUND
        );
        authority
            .activate_stems("project-130-1", "job-11", &preflight)
            .expect("latest analysis should bind stems");
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(stem_root);
    }

    #[test]
    fn stem_file_identity_rejects_replacement_after_preflight() {
        let (root, source) = test_source("stem-identity-full", b"full-mix");
        let (stem_root, preflight) = preflight_stem_fixture("stem-identity");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-140-1", &source)
            .expect("full mix should activate");
        authority
            .begin_stem_analysis("project-140-1", "job-20")
            .expect("analysis should begin");
        authority
            .activate_stems("project-140-1", "job-20", &preflight)
            .expect("preflighted stems should bind");

        let vocals_path = preflight
            .files()
            .iter()
            .find(|file| file.stem_kind() == PlaybackStemKind::Vocals)
            .expect("vocals preflight should exist")
            .native_path()
            .to_path_buf();
        let replacement = vocals_path.with_extension("replacement");
        std::fs::write(&replacement, single_sample_wave())
            .expect("same-size replacement should be written");
        std::fs::remove_file(&vocals_path).expect("preflighted vocals should be removed");
        std::fs::rename(&replacement, &vocals_path)
            .expect("replacement should occupy the preflighted path");

        assert_eq!(
            authority
                .respond(stem_request("project-140-1", PlaybackStemKind::Vocals))
                .status(),
            StatusCode::GONE
        );
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(stem_root);
    }

    #[test]
    fn authorized_response_keeps_revocation_authority_until_use_finishes() {
        let (root, source) = test_source("linearizable-revocation", b"audio");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-150-2", &source)
            .expect("source should activate");

        let lock_was_held = authority.with_current_authority("project-150-2", |_| {
            authority.current.try_lock().is_err()
        });

        assert_eq!(
            lock_was_held,
            Some(true),
            "an authorized response must retain revocation authority until serving finishes"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn current_authority_rejects_path_shaped_or_unknown_tokens() {
        let (root, source) = test_source("token", b"audio");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-200-3", &source)
            .expect("source should activate");

        assert_eq!(
            authority.respond(request("project-999-9")).status(),
            StatusCode::NOT_FOUND
        );
        let traversal = Request::builder()
            .uri(format!("{PLAYBACK_SCHEME}://localhost/project-200-3/../../private.wav"))
            .body(Vec::new())
            .expect("test traversal request should build");
        assert_eq!(authority.respond(traversal).status(), StatusCode::NOT_FOUND);
        let unknown_stem = Request::builder()
            .uri(format!(
                "{PLAYBACK_SCHEME}://localhost/project-200-3/stem/private.wav"
            ))
            .body(Vec::new())
            .expect("unknown stem request should build");
        assert_eq!(authority.respond(unknown_stem).status(), StatusCode::NOT_FOUND);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn single_range_is_bounded_and_reports_partial_content() {
        let bytes = vec![b'x'; (MAX_RANGE_BYTES + 32) as usize];
        let (root, source) = test_source("range", &bytes);
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-300-4", &source)
            .expect("source should activate");
        let request = Request::builder()
            .uri(format!("{PLAYBACK_SCHEME}://localhost/project-300-4"))
            .header(RANGE, "bytes=0-")
            .body(Vec::new())
            .expect("range request should build");

        let response = authority.respond(request);
        let expected_content_range = format!("bytes 0-{}/{}", MAX_RANGE_BYTES - 1, bytes.len());

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body().len() as u64, MAX_RANGE_BYTES);
        assert_eq!(
            response.headers().get(CONTENT_RANGE).and_then(|value| value.to_str().ok()),
            Some(expected_content_range.as_str())
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn large_get_without_range_fails_closed_before_buffering_the_recording() {
        let bytes = vec![b'x'; (MAX_RANGE_BYTES + 32) as usize];
        let (root, source) = test_source("unranged", &bytes);
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-350-4", &source)
            .expect("source should activate");

        let response = authority.respond(request("project-350-4"));
        let expected_content_range = format!("bytes */{}", bytes.len());

        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert!(response.body().is_empty());
        assert_eq!(
            response.headers().get(CONTENT_RANGE).and_then(|value| value.to_str().ok()),
            Some(expected_content_range.as_str())
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn multiple_or_unsatisfiable_ranges_fail_closed() {
        let (root, source) = test_source("invalid-range", b"0123456789");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-400-5", &source)
            .expect("source should activate");
        for value in ["bytes=0-1,3-4", "bytes=99-", "items=0-1", "bytes=-0"] {
            let request = Request::builder()
                .uri(format!("{PLAYBACK_SCHEME}://localhost/project-400-5"))
                .header(RANGE, value)
                .body(Vec::new())
                .expect("invalid range request should build");
            assert_eq!(
                authority.respond(request).status(),
                StatusCode::RANGE_NOT_SATISFIABLE,
                "range {value} must fail closed"
            );
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn source_replacement_after_admission_is_not_served() {
        let (root, source) = test_source("mutation", b"original-audio");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-500-6", &source)
            .expect("source should activate");
        std::fs::write(&source.source_path, b"changed-size")
            .expect("test should replace source contents");

        assert_eq!(
            authority.respond(request("project-500-6")).status(),
            StatusCode::GONE
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn same_size_path_replacement_after_admission_is_not_served() {
        let (root, source) = test_source("same-size-replacement", b"trusted-audio");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-550-6", &source)
            .expect("source should activate");

        let replacement = root.join("replacement.wav");
        std::fs::write(&replacement, b"hostile-audio")
            .expect("test replacement should be written");
        std::fs::remove_file(&source.source_path)
            .expect("admitted source should be removable for replacement");
        std::fs::rename(&replacement, &source.source_path)
            .expect("same-size replacement should occupy admitted path");

        assert_eq!(
            authority.respond(request("project-550-6")).status(),
            StatusCode::GONE
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn same_size_in_place_mutation_after_admission_is_not_served() {
        let (root, source) = test_source("same-size-mutation", b"trusted-audio");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-575-6", &source)
            .expect("source should activate");

        std::fs::write(&source.source_path, b"hostile-audio")
            .expect("test should mutate the admitted source in place");

        assert_eq!(
            authority.respond(request("project-575-6")).status(),
            StatusCode::GONE
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn head_is_metadata_only_and_other_methods_fail_closed() {
        let (root, source) = test_source("head", b"audio-bytes");
        let authority = PlaybackAuthority::default();
        authority
            .activate("project-600-7", &source)
            .expect("source should activate");
        let head = Request::builder()
            .method(Method::HEAD)
            .uri(format!("{PLAYBACK_SCHEME}://localhost/project-600-7"))
            .body(Vec::new())
            .expect("HEAD request should build");
        let post = Request::builder()
            .method(Method::POST)
            .uri(format!("{PLAYBACK_SCHEME}://localhost/project-600-7"))
            .body(Vec::new())
            .expect("POST request should build");

        let head_response = authority.respond(head);
        assert_eq!(head_response.status(), StatusCode::OK);
        assert!(head_response.body().is_empty());
        assert_eq!(
            head_response.headers().get(CONTENT_LENGTH).and_then(|value| value.to_str().ok()),
            Some("11")
        );
        assert_eq!(authority.respond(post).status(), StatusCode::METHOD_NOT_ALLOWED);
        let _ = std::fs::remove_dir_all(root);
    }
}
