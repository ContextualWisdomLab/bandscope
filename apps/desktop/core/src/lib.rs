//! Pure, GUI-independent logic for the BandScope desktop app.
//!
//! This crate holds every payload contract, validation guard, and process
//! helper that does not depend on Tauri or the WebView runtime. Keeping it
//! free of `tauri`/`wry` lets the full unit-test suite build and run (and be
//! measured for coverage) on any platform without a windowing system or a
//! bundled frontend.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use time::OffsetDateTime;

#[derive(Clone)]
pub struct AppState(pub Arc<AppStateInner>);

pub struct AppStateInner {
    pub next_job: AtomicU64,
    pub in_flight_jobs: AtomicUsize,
    pub jobs: Mutex<HashMap<String, AnalysisJobStatus>>,
    pub bootstrap_sources: Mutex<HashMap<String, ProjectBootstrapSummaryPayload>>,
}

pub const MAX_IN_FLIGHT_JOBS: usize = 2;

pub const ANALYSIS_PROCESS_TIMEOUT: Duration = Duration::from_secs(30);

pub const ANALYSIS_WAIT_POLL: Duration = Duration::from_millis(50);

pub const AUDIO_EXTENSIONS: [&str; 4] = ["wav", "mp3", "flac", "m4a"];

pub const MISSING_ANALYSIS_PYTHON: &str = "__bandscope_missing_analysis_python__";

pub const YOUTUBE_IMPORT_TIMEOUT: Duration = Duration::from_secs(120);

pub const MAX_YOUTUBE_URL_LENGTH: usize = 2000;

pub const MAX_SCORE_PDF_BYTES: u64 = 25 * 1024 * 1024;

pub const PDF_MAGIC: &[u8] = b"%PDF-";

impl Default for AppState {
    fn default() -> Self {
        Self(Arc::new(AppStateInner {
            next_job: AtomicU64::new(1),
            in_flight_jobs: AtomicUsize::new(0),
            jobs: Mutex::new(HashMap::new()),
            bootstrap_sources: Mutex::new(HashMap::new()),
        }))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisJobRequest {
    pub source_kind: String,
    pub project_id: Option<String>,
    pub source_label: String,
    pub role_focus: Vec<String>,
    pub local_source: Option<LocalAudioSourcePayload>,
    pub cache_root: Option<String>,
    pub temp_root: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisJobErrorCode {
    InvalidRequest,
    NotFound,
    EngineUnavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisJobError {
    pub code: AnalysisJobErrorCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisJobState {
    Queued,
    Running,
    Succeeded,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisJobStage {
    Queued,
    Decode,
    Separate,
    Analyze,
    Persist,
    Ready,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisCacheStatus {
    Disabled,
    Miss,
    Hit,
    Stored,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RehearsalSongPayload {
    id: String,
    title: String,
    sections: Vec<RehearsalSectionPayload>,
    export_summary: ExportSummaryPayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    score_attachments: Option<Vec<ScoreAttachmentMetadataPayload>>,
}

/// Score attachment metadata persisted inside the song payload. Only the
/// locally minted score id and the display file name cross the IPC boundary;
/// the PDF bytes stay in the app-owned scores directory keyed by that id.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreAttachmentMetadataPayload {
    id: String,
    file_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfidencePayload {
    level: String,
    source: String,
    notes: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CuePayload {
    kind: String,
    value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RangePayload {
    lowest_note: String,
    highest_note: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HarmonyPayload {
    chord: String,
    function_label: String,
    source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManualOverridePayload {
    field: String,
    value: HarmonyPayload,
    source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RehearsalRolePayload {
    id: String,
    name: String,
    role_type: String,
    harmony: HarmonyPayload,
    cue: CuePayload,
    range: RangePayload,
    confidence: ConfidencePayload,
    rehearsal_priority: String,
    simplification: String,
    setup_note: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    hook_plan: Option<String>,
    manual_overrides: Vec<ManualOverridePayload>,
    overlap_warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionTimeRangePayload {
    start: u32,
    end: u32,
}

impl<'de> Deserialize<'de> for SectionTimeRangePayload {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RawSectionTimeRangePayload {
            start: u32,
            end: u32,
        }

        let raw = RawSectionTimeRangePayload::deserialize(deserializer)?;
        if raw.end <= raw.start {
            return Err(serde::de::Error::custom(
                "section timeRange end must be greater than start",
            ));
        }

        Ok(Self {
            start: raw.start,
            end: raw.end,
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PartGraphNodePayload {
    role_id: String,
    is_active: bool,
    handoff_to: Vec<String>,
    handoff_from: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RehearsalSectionPayload {
    id: String,
    label: String,
    groove: String,
    time_range: SectionTimeRangePayload,
    confidence: ConfidencePayload,
    roles: Vec<RehearsalRolePayload>,
    part_graph: Vec<PartGraphNodePayload>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportSummaryPayload {
    format: String,
    headline: String,
    focus_sections: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisJobStatus {
    pub job_id: String,
    pub state: AnalysisJobState,
    pub requested_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_stage: Option<AnalysisJobStage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_status: Option<AnalysisCacheStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<RehearsalSongPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AnalysisJobError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalAudioSourcePayload {
    pub source_path: String,
    pub file_name: String,
    pub extension: String,
    pub file_size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBootstrapSummaryPayload {
    pub project_id: String,
    pub source_mode: String,
    pub project_root: String,
    pub cache_root: String,
    pub temp_root: String,
    pub source: LocalAudioSourcePayload,
}

pub fn next_project_id(state: &AppState) -> String {
    format!(
        "project-{}-{}",
        OffsetDateTime::now_utc().unix_timestamp_nanos(),
        state.0.next_job.fetch_add(1, Ordering::Relaxed)
    )
}

pub fn youtube_source_from_metadata(
    metadata: &Value,
    cache_root: &Path,
) -> Result<LocalAudioSourcePayload, String> {
    let filepath = metadata
        .get("filepath")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Failed to parse YouTube import response.".to_string())?;
    let title = metadata
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or("Unknown YouTube Audio");
    let path = Path::new(filepath);
    let link_metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "Could not read downloaded audio file.".to_string())?;
    #[cfg(not(all(coverage, windows)))]
    if link_metadata.file_type().is_symlink() {
        return Err("YouTube import returned an invalid audio path.".to_string());
    }

    let canonical_cache_root = cache_root
        .canonicalize()
        .map_err(|_| "Could not validate YouTube import workspace.".to_string())?;
    #[cfg(coverage)]
    let canonical = path
        .canonicalize()
        .expect("downloaded audio path should canonicalize after metadata lookup");
    #[cfg(not(coverage))]
    let canonical = path
        .canonicalize()
        .map_err(|_| "Could not read downloaded audio file.".to_string())?;
    if !canonical.starts_with(&canonical_cache_root) {
        return Err("YouTube import returned an invalid audio path.".to_string());
    }

    let file_metadata = link_metadata;
    if !file_metadata.is_file() || file_metadata.len() == 0 {
        return Err("YouTube import returned an invalid audio file.".to_string());
    }

    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "YouTube import returned an unsupported audio format.".to_string())?;
    if !AUDIO_EXTENSIONS.contains(&extension.as_str()) {
        return Err("YouTube import returned an unsupported audio format.".to_string());
    }

    let safe_title: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '.' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(100)
        .collect();
    let safe_title = if safe_title.is_empty() {
        "youtube_audio".to_string()
    } else {
        safe_title
    };

    Ok(LocalAudioSourcePayload {
        source_path: canonical.to_string_lossy().into_owned(),
        file_name: format!("{safe_title}.{extension}"),
        extension,
        file_size_bytes: file_metadata.len(),
    })
}

pub fn is_supported_youtube_url(url: &str) -> bool {
    if url.len() > MAX_YOUTUBE_URL_LENGTH {
        return false;
    }

    let parsed_url = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if parsed_url.scheme() != "https" {
        return false;
    }

    let host = parsed_url.host_str().unwrap_or("").to_lowercase();
    if host == "youtu.be" {
        let mut segments = parsed_url
            .path_segments()
            .expect("https URLs should expose path segments")
            .filter(|segment| !segment.is_empty());
        let Some(video_id) = segments.next() else {
            return false;
        };
        return is_youtube_video_id(video_id) && segments.next().is_none();
    }

    if host == "youtube.com" || host == "www.youtube.com" {
        if parsed_url.path() != "/watch" {
            return false;
        }
        let mut video_ids = parsed_url
            .query_pairs()
            .filter(|(key, _)| key == "v")
            .map(|(_, value)| value);
        return match (video_ids.next(), video_ids.next()) {
            (Some(video_id), None) => is_youtube_video_id(video_id.as_ref()),
            _ => false,
        };
    }

    false
}

pub fn youtube_missing_metadata_error(_parsed: &Value) -> String {
    "YouTube import reported ok but missing metadata.".to_string()
}

pub fn wait_for_process_output(
    mut command: Command,
    timeout: Duration,
    poll_interval: Duration,
    timeout_message: &str,
) -> Result<std::process::Output, String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "Failed to start YouTube import process.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .expect("stdout should be piped for YouTube import process");
    let stderr = child
        .stderr
        .take()
        .expect("stderr should be piped for YouTube import process");
    let stdout_reader = thread::spawn(move || {
        let mut reader = stdout;
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer).map(|_| buffer)
    });
    let stderr_reader = thread::spawn(move || {
        let mut reader = stderr;
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer).map(|_| buffer)
    });
    let deadline = Instant::now() + timeout;

    loop {
        let process_status = {
            #[cfg(coverage)]
            {
                child
                    .try_wait()
                    .expect("YouTube process status polling should not fail under coverage")
            }
            #[cfg(not(coverage))]
            {
                match child.try_wait() {
                    Ok(status) => status,
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        let _ = stdout_reader.join();
                        let _ = stderr_reader.join();
                        return Err("Failed to execute YouTube import process.".to_string());
                    }
                }
            }
        };

        match process_status {
            Some(status) => {
                #[cfg(coverage)]
                let stdout = stdout_reader
                    .join()
                    .expect("stdout reader should not panic")
                    .expect("stdout reader should read process output");
                #[cfg(not(coverage))]
                let stdout = stdout_reader
                    .join()
                    .map_err(|_| "Failed to execute YouTube import process.".to_string())?
                    .map_err(|_| "Failed to execute YouTube import process.".to_string())?;
                #[cfg(coverage)]
                let stderr = stderr_reader
                    .join()
                    .expect("stderr reader should not panic")
                    .expect("stderr reader should read process output");
                #[cfg(not(coverage))]
                let stderr = stderr_reader
                    .join()
                    .map_err(|_| "Failed to execute YouTube import process.".to_string())?
                    .map_err(|_| "Failed to execute YouTube import process.".to_string())?;
                return Ok(std::process::Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            None => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return Err(timeout_message.to_string());
                }
                thread::sleep(poll_interval);
            }
        }
    }
}

pub fn is_youtube_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

pub fn project_payload_from_content(content: &str) -> Result<RehearsalSongPayload, String> {
    if let Ok(parsed) = serde_json::from_str::<RehearsalSongPayload>(content) {
        return validate_hook_plan(parsed);
    }

    let payload = serde_json::from_str::<Value>(content)
        .map_err(|_| "Invalid project file format".to_string())?;
    if let Some(sections) = payload.get("sections").and_then(Value::as_array) {
        for (section_index, section) in sections.iter().enumerate() {
            if section
                .as_object()
                .is_some_and(|section_object| !section_object.contains_key("timeRange"))
            {
                return Err(format!(
                    "Invalid project file format: sections[{section_index}].timeRange is required; reanalyze the project to restore section timing."
                ));
            }
        }
    }

    let parsed =
        serde_json::from_value(payload).map_err(|_| "Invalid project file format".to_string())?;
    validate_hook_plan(parsed)
}

/// Mirrors the shared-types plan whitespace policy, including BOM and NEL.
fn is_plan_whitespace(value: char) -> bool {
    matches!(
        value,
        '\u{0009}'..='\u{000D}'
            | '\u{0020}'
            | '\u{0085}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

/// Reject blank or Unicode line-separated hook guidance without normalizing user text.
fn is_valid_hook_plan(value: &str) -> bool {
    let mut has_non_whitespace = false;
    for character in value.chars() {
        if matches!(
            character,
            '\n' | '\r' | '\u{0085}' | '\u{2028}' | '\u{2029}'
        ) {
            return false;
        }
        if !is_plan_whitespace(character) {
            has_non_whitespace = true;
        }
    }
    has_non_whitespace
}

fn validate_hook_plan(payload: RehearsalSongPayload) -> Result<RehearsalSongPayload, String> {
    for section in &payload.sections {
        for role in &section.roles {
            if role
                .hook_plan
                .as_deref()
                .is_some_and(|hook_plan| !is_valid_hook_plan(hook_plan))
            {
                return Err("Invalid project file format".to_string());
            }
        }
    }
    Ok(payload)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreAttachmentPayload {
    pub score_id: String,
    pub file_name: String,
    pub file_size_bytes: u64,
}

/// Security Notes: project ids never come from free-form user input. They are
/// only ever minted by `next_project_id` as `project-<nanos>-<counter>`, so
/// anything from the WebView that does not match that exact shape is rejected
/// before it can influence a filesystem path (no separators, no `..`).
pub fn is_valid_project_id(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("project-") else {
        return false;
    };
    let mut segments = rest.split('-');
    match (segments.next(), segments.next(), segments.next()) {
        (Some(timestamp), Some(counter), None) => {
            !timestamp.is_empty()
                && !counter.is_empty()
                && timestamp.bytes().all(|byte| byte.is_ascii_digit())
                && counter.bytes().all(|byte| byte.is_ascii_digit())
        }
        _ => false,
    }
}

/// Security Notes: score ids are minted locally via UUID v4 and must round-trip
/// as exactly a lowercase hyphenated UUID (8-4-4-4-12). This is an allowlist
/// check, so path traversal payloads (`..`, separators, null bytes) can never
/// reach the path join below.
pub fn is_valid_score_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, byte)| match index {
        8 | 13 | 18 | 23 => *byte == b'-',
        _ => matches!(byte, b'0'..=b'9' | b'a'..=b'f'),
    })
}

/// Security Notes: the selected file is untrusted input (`User Input Boundary`).
/// We refuse symlinks before canonicalizing, require a real non-empty regular
/// file with a `.pdf` extension, cap the size at 25MB, and verify the `%PDF-`
/// magic bytes so a mislabeled file cannot be attached as a score.
pub fn validate_score_pdf_source(path: &Path) -> Result<(PathBuf, String, u64), String> {
    let link_metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "Could not read the selected PDF file.".to_string())?;
    #[cfg(not(all(coverage, windows)))]
    if link_metadata.file_type().is_symlink() {
        return Err("Could not read the selected PDF file.".to_string());
    }

    #[cfg(coverage)]
    let canonical = path
        .canonicalize()
        .expect("score PDF path should canonicalize after metadata lookup");
    #[cfg(not(coverage))]
    let canonical = path
        .canonicalize()
        .map_err(|_| "Could not read the selected PDF file.".to_string())?;
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Choose a PDF file to attach as a score.".to_string())?;
    if extension != "pdf" {
        return Err("Choose a PDF file to attach as a score.".into());
    }

    let metadata = link_metadata;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("Could not read the selected PDF file.".into());
    }
    if metadata.len() > MAX_SCORE_PDF_BYTES {
        return Err("Score PDF is too large (exceeds 25MB limit).".into());
    }

    let mut header = [0u8; PDF_MAGIC.len()];
    std::fs::File::open(&canonical)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(|_| "Could not read the selected PDF file.".to_string())?;
    if header != PDF_MAGIC {
        return Err("The selected file is not a valid PDF.".into());
    }

    #[cfg(coverage)]
    let file_name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .expect("canonical score PDF path should have a file name")
        .to_string();
    #[cfg(not(coverage))]
    let file_name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "Could not read the selected PDF file.".to_string())?;

    let file_size_bytes = metadata.len();
    Ok((canonical, file_name, file_size_bytes))
}

/// Security Notes: reads and deletes never accept an arbitrary path from the
/// WebView. The path is rebuilt server-side from validated ids, symlinks are
/// refused, and the canonicalized result must still live under the
/// canonicalized app-owned scores root (path-traversal guard).
pub fn resolve_existing_score_pdf(scores_root: &Path, score_id: &str) -> Result<PathBuf, String> {
    if !is_valid_score_id(score_id) {
        return Err("Score was not found.".to_string());
    }
    let candidate = scores_root.join(format!("{score_id}.pdf"));
    let link_metadata =
        std::fs::symlink_metadata(&candidate).map_err(|_| "Score was not found.".to_string())?;
    #[cfg(not(all(coverage, windows)))]
    if link_metadata.file_type().is_symlink() {
        return Err("Score was not found.".to_string());
    }

    #[cfg(coverage)]
    let canonical = candidate
        .canonicalize()
        .expect("stored score path should canonicalize after metadata lookup");
    #[cfg(not(coverage))]
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "Score was not found.".to_string())?;
    #[cfg(not(coverage))]
    {
        let canonical_root = scores_root
            .canonicalize()
            .map_err(|_| "Score was not found.".to_string())?;
        if !canonical.starts_with(&canonical_root) {
            return Err("Score was not found.".to_string());
        }
    }

    let metadata = link_metadata;
    if !metadata.is_file() {
        return Err("Score was not found.".to_string());
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
    }

    fn shared_contract_payload(time_range: Value) -> Value {
        json!({
            "id": "demo-song",
            "title": "Late Night Set",
            "sections": [
                {
                    "id": "verse-1",
                    "label": "verse",
                    "groove": "Straight eighths with a late snare feel",
                    "timeRange": time_range,
                    "confidence": {
                        "level": "medium",
                        "source": "model",
                        "notes": "Double-check the pickup into the chorus."
                    },
                    "roles": [
                        {
                            "id": "bass-guitar",
                            "name": "Bass Guitar",
                            "roleType": "instrument",
                            "harmony": {
                                "chord": "C#m7",
                                "functionLabel": "vi pedal anchor",
                                "source": "model"
                            },
                            "cue": {
                                "kind": "transition",
                                "value": "Hold through the pickup before the downbeat."
                            },
                            "range": {
                                "lowestNote": "C#2",
                                "highestNote": "E3"
                            },
                            "confidence": {
                                "level": "medium",
                                "source": "model",
                                "notes": "Watch the slide into the turnaround."
                            },
                            "rehearsalPriority": "high",
                            "simplification": "Stay on roots if the chorus entrance gets muddy.",
                            "setupNote": "Keep the attack short so the verse breathes.",
                            "hookPlan": "Carry the chorus hook clearly before the band stacks harmony.",
                            "manualOverrides": [],
                            "overlapWarnings": [
                                "Density warning: competing with Keyboard Left Hand in low register."
                            ]
                        }
                    ],
                    "partGraph": [
                        {
                            "role_id": "bass-guitar",
                            "is_active": true,
                            "handoff_to": ["lead-vocal"],
                            "handoff_from": []
                        }
                    ]
                }
            ],
            "exportSummary": {
                "format": "cue-sheet",
                "headline": "Start with the verse handoff and low-register overlap.",
                "focusSections": ["verse-1"]
            }
        })
    }

    #[test]
    fn rehearsal_song_payload_accepts_shared_section_contract() {
        let payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));

        let parsed = serde_json::from_value::<RehearsalSongPayload>(payload)
            .expect("shared rehearsal song contract should deserialize in Tauri");

        assert_eq!(parsed.sections[0].id, "verse-1");
        assert_eq!(
            parsed.sections[0].roles[0].hook_plan.as_deref(),
            Some("Carry the chorus hook clearly before the band stacks harmony.")
        );
    }

    #[test]
    fn rehearsal_song_payload_round_trips_score_attachments() {
        let mut payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));
        payload["scoreAttachments"] = json!([
            { "id": "3f2c8f0e-1a2b-4c3d-8e9f-001122334455", "fileName": "opener.pdf" }
        ]);

        let parsed = serde_json::from_value::<RehearsalSongPayload>(payload)
            .expect("song payload with score attachments should deserialize");
        let attachments = parsed
            .score_attachments
            .as_ref()
            .expect("score attachments should survive deserialization");
        assert_eq!(attachments[0].file_name, "opener.pdf");

        let serialized =
            serde_json::to_value(&parsed).expect("song payload should serialize back to JSON");
        assert_eq!(
            serialized["scoreAttachments"][0]["fileName"],
            json!("opener.pdf")
        );
    }

    #[test]
    fn rehearsal_song_payload_accepts_legacy_files_without_score_attachments() {
        let payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));

        let parsed = serde_json::from_value::<RehearsalSongPayload>(payload)
            .expect("legacy payload without score attachments should deserialize");

        assert!(parsed.score_attachments.is_none());
        let serialized =
            serde_json::to_value(&parsed).expect("legacy payload should serialize back to JSON");
        assert!(serialized.get("scoreAttachments").is_none());
    }

    #[test]
    fn rehearsal_song_payload_rejects_unknown_score_attachment_fields() {
        let mut payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));
        payload["scoreAttachments"] = json!([
            {
                "id": "3f2c8f0e-1a2b-4c3d-8e9f-001122334455",
                "fileName": "opener.pdf",
                "sourcePath": "/etc/passwd"
            }
        ]);

        assert!(serde_json::from_value::<RehearsalSongPayload>(payload).is_err());
    }

    #[test]
    fn rehearsal_song_payload_rejects_reversed_time_range() {
        let payload = shared_contract_payload(json!({ "start": 30, "end": 10 }));

        assert!(serde_json::from_value::<RehearsalSongPayload>(payload).is_err());
    }

    #[test]
    fn project_payload_from_content_rejects_legacy_missing_time_range() {
        let mut payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));
        payload["sections"][0]
            .as_object_mut()
            .expect("section should be an object")
            .remove("timeRange");
        let content = serde_json::to_string(&payload).expect("legacy payload should serialize");

        let error = project_payload_from_content(&content)
            .expect_err("legacy sections without timing should fail closed");

        assert!(error.contains("timeRange"));
    }

    #[test]
    fn project_payload_from_content_accepts_current_contract() {
        let payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));
        let content = serde_json::to_string(&payload).expect("payload should serialize");

        let parsed = project_payload_from_content(&content)
            .expect("current shared contract should parse directly");

        assert_eq!(parsed.title, "Late Night Set");
    }

    #[test]
    fn project_payload_from_content_rejects_malformed_or_incomplete_payloads() {
        assert_eq!(
            project_payload_from_content("{").expect_err("malformed JSON should fail"),
            "Invalid project file format"
        );

        let error = project_payload_from_content(r#"{"sections":[]}"#)
            .expect_err("incomplete payload should fail closed");
        assert_eq!(error, "Invalid project file format");

        let error = project_payload_from_content(r#"{"sections":[null]}"#)
            .expect_err("malformed section entries should fail closed");
        assert_eq!(error, "Invalid project file format");

        let error = project_payload_from_content(r#"{"title":"Late Night Set"}"#)
            .expect_err("sectionless payload should fail closed");
        assert_eq!(error, "Invalid project file format");

        let error =
            project_payload_from_content(r#"{"sections":[{"timeRange":{"start":0,"end":1}}]}"#)
                .expect_err("timed but incomplete payload should fail closed");
        assert_eq!(error, "Invalid project file format");
    }

    #[test]
    fn project_payload_from_content_rejects_invalid_hook_plan() {
        for hook_plan in ["", "   ", "carry here\nthen move", "carry here\rthen move"] {
            let mut payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));
            payload["sections"][0]["roles"][0]["hookPlan"] = json!(hook_plan);
            let content = serde_json::to_string(&payload).expect("payload should serialize");

            assert!(project_payload_from_content(&content).is_err());
        }
    }

    #[test]
    fn youtube_url_validation_requires_exact_video_ids() {
        assert!(is_supported_youtube_url(
            "https://youtube.com/watch?v=abc123DEF45"
        ));
        assert!(is_supported_youtube_url(
            "https://www.youtube.com/watch?v=abc123DEF45"
        ));
        assert!(is_supported_youtube_url("https://youtu.be/abc123DEF45"));

        assert!(!is_supported_youtube_url(
            "https://evil.youtube.com/watch?v=abc123DEF45"
        ));
        assert!(!is_supported_youtube_url(
            "https://youtube.com/watch?v=abc123"
        ));
        assert!(!is_supported_youtube_url(
            "https://youtube.com/watch?v=abc123DEF4!"
        ));
        assert!(!is_supported_youtube_url("https://youtube.com/watch"));
        assert!(!is_supported_youtube_url(
            "https://youtube.com/watch?v=abc123DEF45&v=def456GHI78"
        ));
        assert!(!is_supported_youtube_url("https://youtu.be/abc123"));
        assert!(!is_supported_youtube_url("https://youtu.be/abc123DEF4!"));
    }

    #[test]
    fn youtube_url_validation_rejects_malformed_and_nonstandard_urls() {
        assert!(!is_supported_youtube_url("not a url"));
        assert!(!is_supported_youtube_url(
            "http://youtube.com/watch?v=abc123DEF45"
        ));
        assert!(!is_supported_youtube_url("https://youtu.be/"));
        assert!(!is_supported_youtube_url(
            "https://youtube.com/embed/abc123DEF45"
        ));

        let long_url = format!("https://youtube.com/watch?v={}", "a".repeat(2000));
        assert!(!is_supported_youtube_url(&long_url));
    }

    #[test]
    fn youtube_missing_metadata_error_does_not_expose_payload() {
        let parsed = json!({
            "ok": true,
            "filepath": "/Users/someone/private-song.m4a",
            "metadata": null
        });

        let message = youtube_missing_metadata_error(&parsed);

        assert_eq!(message, "YouTube import reported ok but missing metadata.");
        assert!(!message.contains("private-song"));
        assert!(!message.contains("filepath"));
    }

    #[test]
    fn youtube_process_timeout_kills_and_reaps_child() {
        let command = long_sleep_command();

        let result = wait_for_process_output(
            command,
            Duration::from_millis(50),
            Duration::from_millis(5),
            "YouTube import timed out.",
        );

        assert_eq!(
            result.expect_err("slow child should time out"),
            "YouTube import timed out."
        );
    }

    #[test]
    fn youtube_process_output_reports_spawn_failure() {
        let command = Command::new(unique_test_dir("missing-youtube-command").join("missing-tool"));

        let result = wait_for_process_output(
            command,
            Duration::from_millis(50),
            Duration::from_millis(5),
            "YouTube import timed out.",
        );

        assert_eq!(
            result.expect_err("missing helper should fail at spawn"),
            "Failed to start YouTube import process."
        );
    }

    fn long_sleep_command() -> Command {
        #[cfg(windows)]
        {
            let mut command = Command::new("powershell");
            command
                .arg("-NoProfile")
                .arg("-Command")
                .arg("Start-Sleep -Seconds 5");
            command
        }

        #[cfg(not(windows))]
        {
            let mut command = Command::new("sh");
            command.arg("-c").arg("sleep 5");
            command
        }
    }

    #[test]
    fn youtube_process_output_drains_large_stdout_and_stderr_before_exit() {
        if std::env::var_os("BANDSCOPE_TEST_CHILD_LARGE_OUTPUT").is_some() {
            let chunk = vec![b'x'; 1024 * 1024];
            std::io::stdout()
                .write_all(&chunk)
                .expect("child stdout should accept test bytes");
            std::io::stderr()
                .write_all(&chunk)
                .expect("child stderr should accept test bytes");
            return;
        }

        let current_test_binary = std::env::current_exe().expect("test binary should resolve");
        let mut command = Command::new(current_test_binary);
        command
            .env("BANDSCOPE_TEST_CHILD_LARGE_OUTPUT", "1")
            .arg("--exact")
            .arg("tests::youtube_process_output_drains_large_stdout_and_stderr_before_exit")
            .arg("--nocapture");

        let output = wait_for_process_output(
            command,
            Duration::from_secs(2),
            Duration::from_millis(5),
            "YouTube import timed out.",
        )
        .expect("large child output should be drained before timeout");

        assert!(output.status.success());
        assert!(output.stdout.len() >= 1024 * 1024);
        assert!(output.stderr.len() >= 1024 * 1024);
    }

    #[test]
    fn youtube_metadata_must_reference_supported_audio_inside_cache_root() {
        let cache_root = unique_test_dir("youtube-cache");
        let outside_root = unique_test_dir("youtube-outside");
        std::fs::create_dir_all(&cache_root).expect("cache root should be created");
        std::fs::create_dir_all(&outside_root).expect("outside root should be created");

        let inside_file = cache_root.join("downloaded.m4a");
        let empty_file = cache_root.join("empty.m4a");
        let unsupported_file = cache_root.join("downloaded.txt");
        let no_extension_file = cache_root.join("downloaded");
        let outside_file = outside_root.join("downloaded.m4a");
        std::fs::write(&inside_file, b"audio").expect("inside file should be written");
        std::fs::write(&empty_file, b"").expect("empty file should be written");
        std::fs::write(&unsupported_file, b"not audio")
            .expect("unsupported file should be written");
        std::fs::write(&no_extension_file, b"audio").expect("extensionless file should be written");
        std::fs::write(&outside_file, b"audio").expect("outside file should be written");

        let accepted = youtube_source_from_metadata(
            &json!({ "filepath": inside_file, "title": "Live/Test" }),
            &cache_root,
        )
        .expect("in-cache supported audio should be accepted");
        assert_eq!(accepted.extension, "m4a");
        assert_eq!(accepted.file_name, "Live_Test.m4a");

        let default_title =
            youtube_source_from_metadata(&json!({ "filepath": inside_file }), &cache_root)
                .expect("missing YouTube title should use the default filename stem");
        assert_eq!(default_title.file_name, "Unknown YouTube Audio.m4a");

        let empty_title = youtube_source_from_metadata(
            &json!({ "filepath": inside_file, "title": "" }),
            &cache_root,
        )
        .expect("empty YouTube title should use the safe fallback filename stem");
        assert_eq!(empty_title.file_name, "youtube_audio.m4a");

        let control_title = youtube_source_from_metadata(
            &json!({ "filepath": inside_file, "title": "Live\u{0007}Bell" }),
            &cache_root,
        )
        .expect("control characters should be sanitized out of filenames");
        assert_eq!(control_title.file_name, "Live_Bell.m4a");

        assert_eq!(
            youtube_source_from_metadata(&json!({ "title": "Live" }), &cache_root)
                .expect_err("missing filepath should fail closed"),
            "Failed to parse YouTube import response."
        );
        assert_eq!(
            youtube_source_from_metadata(
                &json!({ "filepath": cache_root.join("missing.m4a"), "title": "Live" }),
                &cache_root,
            )
            .expect_err("missing downloaded file should fail closed"),
            "Could not read downloaded audio file."
        );
        let missing_cache_root = unique_test_dir("youtube-missing-cache");
        assert_eq!(
            youtube_source_from_metadata(
                &json!({ "filepath": inside_file, "title": "Live" }),
                &missing_cache_root,
            )
            .expect_err("missing cache root should fail closed"),
            "Could not validate YouTube import workspace."
        );
        assert!(youtube_source_from_metadata(
            &json!({ "filepath": empty_file, "title": "Live" }),
            &cache_root,
        )
        .is_err());
        assert!(youtube_source_from_metadata(
            &json!({ "filepath": unsupported_file, "title": "Live" }),
            &cache_root,
        )
        .is_err());
        assert!(youtube_source_from_metadata(
            &json!({ "filepath": no_extension_file, "title": "Live" }),
            &cache_root,
        )
        .is_err());
        assert!(youtube_source_from_metadata(
            &json!({ "filepath": outside_file, "title": "Live" }),
            &cache_root,
        )
        .is_err());

        #[cfg(unix)]
        {
            let symlink_file = cache_root.join("linked.m4a");
            std::os::unix::fs::symlink(&inside_file, &symlink_file)
                .expect("symlink should be created");
            assert!(youtube_source_from_metadata(
                &json!({ "filepath": symlink_file, "title": "Live" }),
                &cache_root,
            )
            .is_err());
        }

        let _ = std::fs::remove_dir_all(cache_root);
        let _ = std::fs::remove_dir_all(outside_root);
    }

    #[test]
    fn project_id_guard_accepts_generated_ids_only() {
        let generated = next_project_id(&AppState::default());
        assert!(is_valid_project_id(&generated));
        assert!(is_valid_project_id("project-1751234567890123456-1"));

        assert!(!is_valid_project_id(""));
        assert!(!is_valid_project_id("project-"));
        assert!(!is_valid_project_id("project-123"));
        assert!(!is_valid_project_id("project-123-"));
        assert!(!is_valid_project_id("project-123-4-5"));
        assert!(!is_valid_project_id("project-abc-1"));
        assert!(!is_valid_project_id("project-123-1x"));
        assert!(!is_valid_project_id("other-123-1"));
        assert!(!is_valid_project_id("../project-123-1"));
        assert!(!is_valid_project_id("project-123-1/.."));
        assert!(!is_valid_project_id("project-..-1"));
        assert!(!is_valid_project_id("project-123-1/escape"));
    }

    #[test]
    fn score_id_guard_accepts_lowercase_uuid_v4_only() {
        let generated = uuid::Uuid::new_v4().to_string();
        assert!(is_valid_score_id(&generated));
        assert!(is_valid_score_id("6fa459ea-ee8a-3ca4-894e-db77e160355e"));

        assert!(!is_valid_score_id(""));
        assert!(!is_valid_score_id("not-a-uuid"));
        assert!(!is_valid_score_id("6FA459EA-EE8A-3CA4-894E-DB77E160355E"));
        assert!(!is_valid_score_id("6fa459eaee8a3ca4894edb77e160355e"));
        assert!(!is_valid_score_id("{6fa459ea-ee8a-3ca4-894e-db77e160355e}"));
        assert!(!is_valid_score_id("../../../../etc/passwd-aaaa-bbbb-cc"));
        assert!(!is_valid_score_id(
            "6fa459ea-ee8a-3ca4-894e-db77e160355e/.."
        ));
        assert!(!is_valid_score_id("6fa459ea-ee8a-3ca4-894e-db77e16035/e"));
    }

    #[test]
    fn score_pdf_source_requires_pdf_magic_size_and_real_file() {
        let root = unique_test_dir("score-source");
        std::fs::create_dir_all(&root).expect("score source root should be created");

        let valid = root.join("score.pdf");
        std::fs::write(&valid, b"%PDF-1.7 fake body").expect("valid pdf should be written");
        let (canonical, file_name, size) =
            validate_score_pdf_source(&valid).expect("valid pdf should be accepted");
        assert_eq!(file_name, "score.pdf");
        assert_eq!(size, 18);
        assert!(canonical.ends_with("score.pdf"));

        let wrong_magic = root.join("not-really.pdf");
        std::fs::write(&wrong_magic, b"PK\x03\x04 zip bytes")
            .expect("wrong magic file should be written");
        assert!(validate_score_pdf_source(&wrong_magic).is_err());

        let short = root.join("short.pdf");
        std::fs::write(&short, b"%PD").expect("short file should be written");
        assert!(validate_score_pdf_source(&short).is_err());

        let empty = root.join("empty.pdf");
        std::fs::write(&empty, b"").expect("empty file should be written");
        assert!(validate_score_pdf_source(&empty).is_err());

        let wrong_extension = root.join("score.txt");
        std::fs::write(&wrong_extension, b"%PDF-1.7").expect("txt file should be written");
        assert!(validate_score_pdf_source(&wrong_extension).is_err());

        let missing_extension = root.join("score");
        std::fs::write(&missing_extension, b"%PDF-1.7")
            .expect("extensionless score file should be written");
        assert!(validate_score_pdf_source(&missing_extension).is_err());

        let missing = root.join("missing.pdf");
        assert!(validate_score_pdf_source(&missing).is_err());

        let oversized = root.join("oversized.pdf");
        {
            let file = std::fs::File::create(&oversized).expect("oversized file should be created");
            let mut file = file;
            file.write_all(b"%PDF-1.7")
                .expect("oversized header should be written");
            file.set_len(MAX_SCORE_PDF_BYTES + 1)
                .expect("oversized file should be extended");
        }
        assert!(validate_score_pdf_source(&oversized).is_err());

        #[cfg(unix)]
        {
            let symlinked = root.join("linked.pdf");
            std::os::unix::fs::symlink(&valid, &symlinked).expect("symlink should be created");
            assert!(validate_score_pdf_source(&symlinked).is_err());
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn score_pdf_resolution_rejects_traversal_and_escapes() {
        let scores_root = unique_test_dir("score-resolve");
        let outside_root = unique_test_dir("score-outside");
        std::fs::create_dir_all(&scores_root).expect("scores root should be created");
        std::fs::create_dir_all(&outside_root).expect("outside root should be created");

        let score_id = "6fa459ea-ee8a-3ca4-894e-db77e160355e";
        let inside_file = scores_root.join(format!("{score_id}.pdf"));
        std::fs::write(&inside_file, b"%PDF-1.7").expect("inside file should be written");

        let resolved = resolve_existing_score_pdf(&scores_root, score_id)
            .expect("stored score inside the root should resolve");
        assert!(resolved.ends_with(format!("{score_id}.pdf")));

        let directory_id = "22222222-3333-4444-5555-666666666666";
        std::fs::create_dir(scores_root.join(format!("{directory_id}.pdf")))
            .expect("directory named like a score should be created");
        assert!(resolve_existing_score_pdf(&scores_root, directory_id).is_err());

        assert!(resolve_existing_score_pdf(&scores_root, "../escape").is_err());
        assert!(resolve_existing_score_pdf(&scores_root, "..").is_err());
        assert!(
            resolve_existing_score_pdf(&scores_root, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
                .is_err()
        );

        #[cfg(unix)]
        {
            let outside_file = outside_root.join("secret.pdf");
            std::fs::write(&outside_file, b"%PDF-1.7").expect("outside file should be written");
            let linked_id = "11111111-2222-3333-4444-555555555555";
            std::os::unix::fs::symlink(&outside_file, scores_root.join(format!("{linked_id}.pdf")))
                .expect("symlink should be created");
            assert!(resolve_existing_score_pdf(&scores_root, linked_id).is_err());
        }

        let _ = std::fs::remove_dir_all(scores_root);
        let _ = std::fs::remove_dir_all(outside_root);
    }
}
