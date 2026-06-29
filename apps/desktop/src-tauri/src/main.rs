#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rfd::FileDialog;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, Runtime};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Clone)]
struct AppState(Arc<AppStateInner>);

struct AppStateInner {
    next_job: AtomicU64,
    in_flight_jobs: AtomicUsize,
    jobs: Mutex<HashMap<String, AnalysisJobStatus>>,
    bootstrap_sources: Mutex<HashMap<String, ProjectBootstrapSummaryPayload>>,
}

const MAX_IN_FLIGHT_JOBS: usize = 2;
const ANALYSIS_PROCESS_TIMEOUT: Duration = Duration::from_secs(30);
const ANALYSIS_WAIT_POLL: Duration = Duration::from_millis(50);
const AUDIO_EXTENSIONS: [&str; 4] = ["wav", "mp3", "flac", "m4a"];
const MISSING_ANALYSIS_PYTHON: &str = "__bandscope_missing_analysis_python__";
const YOUTUBE_IMPORT_TIMEOUT: Duration = Duration::from_secs(120);

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
struct AnalysisJobRequest {
    source_kind: String,
    project_id: Option<String>,
    source_label: String,
    role_focus: Vec<String>,
    local_source: Option<LocalAudioSourcePayload>,
    cache_root: Option<String>,
    temp_root: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum AnalysisJobErrorCode {
    InvalidRequest,
    NotFound,
    EngineUnavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnalysisJobError {
    code: AnalysisJobErrorCode,
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum AnalysisJobState {
    Queued,
    Running,
    Succeeded,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum AnalysisJobStage {
    Queued,
    Decode,
    Separate,
    Analyze,
    Persist,
    Ready,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum AnalysisCacheStatus {
    Disabled,
    Miss,
    Hit,
    Stored,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RehearsalSongPayload {
    id: String,
    title: String,
    sections: Vec<RehearsalSectionPayload>,
    export_summary: ExportSummaryPayload,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfidencePayload {
    level: String,
    source: String,
    notes: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CuePayload {
    kind: String,
    value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RangePayload {
    lowest_note: String,
    highest_note: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HarmonyPayload {
    chord: String,
    function_label: String,
    source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManualOverridePayload {
    field: String,
    value: HarmonyPayload,
    source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RehearsalRolePayload {
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
    manual_overrides: Vec<ManualOverridePayload>,
    overlap_warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SectionTimeRangePayload {
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
struct PartGraphNodePayload {
    role_id: String,
    is_active: bool,
    handoff_to: Vec<String>,
    handoff_from: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RehearsalSectionPayload {
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
struct ExportSummaryPayload {
    format: String,
    headline: String,
    focus_sections: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnalysisJobStatus {
    job_id: String,
    state: AnalysisJobState,
    requested_at: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress_stage: Option<AnalysisJobStage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress_percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_status: Option<AnalysisCacheStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<RehearsalSongPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<AnalysisJobError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalAudioSourcePayload {
    source_path: String,
    file_name: String,
    extension: String,
    file_size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectBootstrapSummaryPayload {
    project_id: String,
    source_mode: String,
    project_root: String,
    cache_root: String,
    temp_root: String,
    source: LocalAudioSourcePayload,
}

fn iso_timestamp_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

fn unique_push(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|existing| existing == &candidate) {
        paths.push(candidate);
    }
}

fn runtime_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            unique_push(&mut roots, parent.to_path_buf());
            unique_push(&mut roots, parent.join("resources"));
            unique_push(&mut roots, parent.join("../Resources"));
        }
    }
    roots
}

fn analysis_command() -> (PathBuf, String, Vec<String>) {
    if let Ok(python_path) = std::env::var("BANDSCOPE_ANALYSIS_PYTHON") {
        return (
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            python_path,
            vec!["-m".into(), "bandscope_analysis.cli".into()],
        );
    }

    for root in runtime_search_roots() {
        let candidates = [
            root.join("services")
                .join("analysis-engine")
                .join(".venv")
                .join("bin")
                .join("python"),
            root.join("services")
                .join("analysis-engine")
                .join(".venv")
                .join("Scripts")
                .join("python.exe"),
            root.join("analysis-engine")
                .join(".venv")
                .join("bin")
                .join("python"),
            root.join("analysis-engine")
                .join(".venv")
                .join("Scripts")
                .join("python.exe"),
            root.join("analysis-engine")
                .join("python")
                .join("bin")
                .join("python"),
            root.join("analysis-engine")
                .join("python")
                .join("python.exe"),
            root.join("python").join("bin").join("python"),
            root.join("python").join("python.exe"),
        ];

        for candidate in candidates {
            if candidate.is_file() {
                return (
                    root,
                    candidate.to_string_lossy().into_owned(),
                    vec!["-m".into(), "bandscope_analysis.cli".into()],
                );
            }
        }
    }

    (
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
        MISSING_ANALYSIS_PYTHON.into(),
        Vec::new(),
    )
}

fn try_acquire_job_slot(state: &AppState) -> bool {
    state
        .0
        .in_flight_jobs
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
            (current < MAX_IN_FLIGHT_JOBS).then_some(current + 1)
        })
        .is_ok()
}

fn release_job_slot(state: &AppState) {
    state.0.in_flight_jobs.fetch_sub(1, Ordering::SeqCst);
}

fn next_project_id(state: &AppState) -> String {
    format!(
        "project-{}-{}",
        OffsetDateTime::now_utc().unix_timestamp_nanos(),
        state.0.next_job.fetch_add(1, Ordering::Relaxed)
    )
}

fn app_owned_root<R: Runtime>(
    app: &tauri::AppHandle<R>,
    kind: &str,
    project_id: &str,
) -> Result<PathBuf, String> {
    if project_id.contains("..") || project_id.contains('/') || project_id.contains('\\') {
        return Err("Invalid project ID: path traversal detected.".to_string());
    }

    let base_root = match kind {
        "projects" => app
            .path()
            .app_local_data_dir()
            .map_err(|_| "Could not prepare the local project workspace.".to_string())?,
        "cache" => app
            .path()
            .app_cache_dir()
            .map_err(|_| "Could not prepare the local cache workspace.".to_string())?,
        "temp" => app
            .path()
            .app_local_data_dir()
            .map(|path| path.join("temp"))
            .map_err(|_| "Could not prepare the local temp workspace.".to_string())?,
        _ => return Err(format!("Could not prepare the local {kind} workspace.")),
    };
    let root = base_root.join(project_id);
    std::fs::create_dir_all(&root)
        .map_err(|_| format!("Could not prepare the local {kind} workspace."))?;
    Ok(root)
}

fn normalize_local_audio_source(path: &Path) -> Result<LocalAudioSourcePayload, String> {
    let canonical = path
        .canonicalize()
        .map_err(|_| "Could not read the selected audio file.".to_string())?;
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Choose a WAV, MP3, FLAC, or M4A file to start analysis.".to_string())?;
    if !AUDIO_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Choose a WAV, MP3, FLAC, or M4A file to start analysis.".into());
    }
    let metadata = std::fs::metadata(&canonical)
        .map_err(|_| "Could not read the selected audio file.".to_string())?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("Could not read the selected audio file.".into());
    }
    let file_name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Could not read the selected audio file.".to_string())?;

    Ok(LocalAudioSourcePayload {
        source_path: canonical.to_string_lossy().into_owned(),
        file_name: file_name.to_string(),
        extension,
        file_size_bytes: metadata.len(),
    })
}

fn youtube_source_from_metadata(
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
    if link_metadata.file_type().is_symlink() {
        return Err("YouTube import returned an invalid audio path.".to_string());
    }

    let canonical_cache_root = cache_root
        .canonicalize()
        .map_err(|_| "Could not validate YouTube import workspace.".to_string())?;
    let canonical = path
        .canonicalize()
        .map_err(|_| "Could not read downloaded audio file.".to_string())?;
    if !canonical.starts_with(&canonical_cache_root) {
        return Err("YouTube import returned an invalid audio path.".to_string());
    }

    let file_metadata = std::fs::metadata(&canonical)
        .map_err(|_| "Could not read downloaded audio file.".to_string())?;
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

fn parse_request_payload(payload: Value) -> Result<AnalysisJobRequest, String> {
    let Value::Object(map) = payload else {
        return Err("Invalid analysis job request: invalid field 'root'".into());
    };

    for key in map.keys() {
        if key != "sourceKind"
            && key != "projectId"
            && key != "sourceLabel"
            && key != "roleFocus"
            && key != "localSource"
        {
            return Err(format!(
                "Invalid analysis job request: invalid field '{key}'"
            ));
        }
    }

    let source_kind = map.get("sourceKind").and_then(Value::as_str);
    let project_id = map.get("projectId").and_then(Value::as_str);
    let source_label = map.get("sourceLabel").and_then(Value::as_str);
    let role_focus = map.get("roleFocus").and_then(Value::as_array);
    let local_source = match map.get("localSource") {
        Some(value) => Some(
            serde_json::from_value::<LocalAudioSourcePayload>(value.clone()).map_err(|_| {
                "Invalid analysis job request: invalid field 'localSource'".to_string()
            })?,
        ),
        None => None,
    };

    if source_kind != Some("demo") && source_kind != Some("local_audio") {
        return Err("Invalid analysis job request: invalid field 'sourceKind'".into());
    }
    let source_label = source_label
        .filter(|label| !label.trim().is_empty())
        .ok_or_else(|| "Invalid analysis job request: invalid field 'sourceLabel'".to_string())?;
    let role_focus = role_focus
        .ok_or_else(|| "Invalid analysis job request: invalid field 'roleFocus'".to_string())?;
    let mut parsed_role_focus = Vec::with_capacity(role_focus.len());
    for (index, role) in role_focus.iter().enumerate() {
        let Some(role) = role.as_str() else {
            return Err(format!(
                "Invalid analysis job request: invalid field 'roleFocus[{index}]'"
            ));
        };
        parsed_role_focus.push(role.to_string());
    }

    match source_kind {
        Some("demo") => {
            if local_source.is_some() || project_id.is_some() {
                return Err("Invalid analysis job request: invalid field 'projectId'".into());
            }
        }
        Some("local_audio") => {
            let Some(project_id) = project_id else {
                return Err("Invalid analysis job request: invalid field 'projectId'".into());
            };
            if project_id.trim().is_empty()
                || project_id.contains("..")
                || project_id.contains('/')
                || project_id.contains('\\')
            {
                return Err("Invalid analysis job request: invalid field 'projectId'".into());
            }
            if local_source.is_some() {
                return Err("Invalid analysis job request: invalid field 'localSource'".into());
            }
        }
        _ => {}
    }

    Ok(AnalysisJobRequest {
        source_kind: source_kind.unwrap_or("demo").to_string(),
        project_id: project_id.map(|value| value.to_string()),
        source_label: source_label.to_string(),
        role_focus: parsed_role_focus,
        local_source,
        cache_root: None,
        temp_root: None,
    })
}

fn failed_status(
    job_id: String,
    requested_at: String,
    code: AnalysisJobErrorCode,
    message: &str,
) -> AnalysisJobStatus {
    AnalysisJobStatus {
        job_id,
        state: AnalysisJobState::Failed,
        requested_at,
        updated_at: iso_timestamp_now(),
        progress_label: None,
        progress_stage: None,
        progress_percent: None,
        cache_status: None,
        result: None,
        error: Some(AnalysisJobError {
            code,
            message: message.into(),
        }),
    }
}

fn store_status(state: &AppState, status: &AnalysisJobStatus) {
    if let Ok(mut jobs) = state.0.jobs.lock() {
        jobs.insert(status.job_id.clone(), status.clone());
    }
}

fn store_status_and_emit<R: Runtime>(
    state: &AppState,
    app: &tauri::AppHandle<R>,
    status: &AnalysisJobStatus,
) {
    store_status(state, status);
    let _ = app.emit("analysis-job-updated", status);
}

fn store_bootstrap_source(state: &AppState, summary: ProjectBootstrapSummaryPayload) {
    if let Ok(mut sources) = state.0.bootstrap_sources.lock() {
        sources.insert(summary.project_id.clone(), summary);
    }
}

fn lookup_bootstrap_source(
    state: &AppState,
    project_id: &str,
) -> Result<ProjectBootstrapSummaryPayload, String> {
    state
        .0
        .bootstrap_sources
        .lock()
        .ok()
        .and_then(|sources| sources.get(project_id).cloned())
        .ok_or_else(|| "Analysis job source was not found. Choose local audio again.".to_string())
}

fn drain_analysis_status_updates(
    state: &AppState,
    app: &tauri::AppHandle<impl Runtime>,
    status_rx: &mpsc::Receiver<AnalysisJobStatus>,
    last_status: &mut Option<AnalysisJobStatus>,
) {
    while let Ok(status) = status_rx.try_recv() {
        store_status_and_emit(state, app, &status);
        *last_status = Some(status);
    }
}

fn run_analysis_engine(
    state: AppState,
    app: tauri::AppHandle<impl Runtime>,
    job_id: String,
    request: AnalysisJobRequest,
    requested_at: String,
) -> AnalysisJobStatus {
    let (working_dir, program, mut args) = analysis_command();

    if program == MISSING_ANALYSIS_PYTHON {
        return failed_status(
            job_id,
            requested_at,
            AnalysisJobErrorCode::EngineUnavailable,
            "Analysis engine is unavailable.",
        );
    }
    args.push("--progress-jsonl".into());

    let mut process = match Command::new(program)
        .args(args)
        .current_dir(working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(process) => process,
        Err(_) => {
            return failed_status(
                job_id,
                requested_at,
                AnalysisJobErrorCode::EngineUnavailable,
                "Analysis engine is unavailable.",
            )
        }
    };

    let payload = json!({
        "jobId": job_id.clone(),
        "request": request,
    });
    let Some(stdout) = process.stdout.take() else {
        let _ = process.kill();
        let _ = process.wait();
        return failed_status(
            job_id,
            requested_at,
            AnalysisJobErrorCode::EngineUnavailable,
            "Analysis engine is unavailable.",
        );
    };
    let Some(stderr) = process.stderr.take() else {
        let _ = process.kill();
        let _ = process.wait();
        return failed_status(
            job_id,
            requested_at,
            AnalysisJobErrorCode::EngineUnavailable,
            "Analysis engine is unavailable.",
        );
    };
    let (status_tx, status_rx) = mpsc::channel::<AnalysisJobStatus>();
    let stdout_reader = thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut last_status = None;
        for line in reader.lines() {
            let Ok(line) = line else {
                break;
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(status) = serde_json::from_str::<AnalysisJobStatus>(trimmed) {
                last_status = Some(status.clone());
                if status_tx.send(status).is_err() {
                    break;
                }
            }
        }
        last_status
    });
    let stderr_reader = thread::spawn(move || {
        let mut reader = stderr;
        let mut buffer = Vec::new();
        let _ = reader.read_to_end(&mut buffer);
        buffer
    });

    if let Some(mut stdin) = process.stdin.take() {
        if stdin.write_all(payload.to_string().as_bytes()).is_err() {
            let _ = process.kill();
            let _ = process.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return failed_status(
                payload["jobId"]
                    .as_str()
                    .unwrap_or("unknown-job")
                    .to_string(),
                requested_at,
                AnalysisJobErrorCode::EngineUnavailable,
                "Analysis engine is unavailable.",
            );
        }
    }

    let deadline = Instant::now() + ANALYSIS_PROCESS_TIMEOUT;
    let mut last_status = None;
    let exit_status;
    loop {
        drain_analysis_status_updates(&state, &app, &status_rx, &mut last_status);
        match process.try_wait() {
            Ok(Some(status)) => {
                exit_status = status;
                break;
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = process.kill();
                    let _ = process.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return failed_status(
                        payload["jobId"]
                            .as_str()
                            .unwrap_or("unknown-job")
                            .to_string(),
                        requested_at,
                        AnalysisJobErrorCode::EngineUnavailable,
                        "Analysis engine timed out.",
                    );
                }
                thread::sleep(ANALYSIS_WAIT_POLL);
            }
            Err(_) => {
                let _ = process.kill();
                let _ = process.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return failed_status(
                    payload["jobId"]
                        .as_str()
                        .unwrap_or("unknown-job")
                        .to_string(),
                    requested_at,
                    AnalysisJobErrorCode::EngineUnavailable,
                    "Analysis engine is unavailable.",
                );
            }
        }
    }
    let reader_last_status = stdout_reader.join().unwrap_or(None);
    let _ = stderr_reader.join();
    drain_analysis_status_updates(&state, &app, &status_rx, &mut last_status);
    if last_status.is_none() {
        last_status = reader_last_status;
    }

    if !exit_status.success() {
        return failed_status(
            payload["jobId"]
                .as_str()
                .unwrap_or("unknown-job")
                .to_string(),
            requested_at,
            AnalysisJobErrorCode::EngineUnavailable,
            "Analysis engine is unavailable.",
        );
    }

    last_status.unwrap_or_else(|| {
        failed_status(
            payload["jobId"]
                .as_str()
                .unwrap_or("unknown-job")
                .to_string(),
            requested_at,
            AnalysisJobErrorCode::EngineUnavailable,
            "Analysis engine returned an invalid response.",
        )
    })
}

#[tauri::command]
fn start_analysis_job(
    request: Value,
    app: tauri::AppHandle<impl Runtime>,
    state: tauri::State<'_, AppState>,
) -> AnalysisJobStatus {
    let requested_at = iso_timestamp_now();
    let mut parsed_request = match parse_request_payload(request) {
        Ok(parsed_request) => parsed_request,
        Err(message) => {
            return failed_status(
                "invalid-job".into(),
                requested_at,
                AnalysisJobErrorCode::InvalidRequest,
                &message,
            )
        }
    };

    if parsed_request.source_kind == "local_audio" {
        let Some(project_id) = parsed_request.project_id.clone() else {
            return failed_status(
                "invalid-job".into(),
                requested_at,
                AnalysisJobErrorCode::InvalidRequest,
                "Invalid analysis job request: invalid field 'projectId'",
            );
        };
        let bootstrap = match lookup_bootstrap_source(&state, &project_id) {
            Ok(bootstrap) => bootstrap,
            Err(message) => {
                return failed_status(
                    "invalid-job".into(),
                    requested_at,
                    AnalysisJobErrorCode::NotFound,
                    &message,
                )
            }
        };
        parsed_request.source_label = bootstrap.source.file_name.clone();
        parsed_request.cache_root = Some(bootstrap.cache_root.clone());
        parsed_request.temp_root = Some(bootstrap.temp_root.clone());
        parsed_request.local_source = Some(bootstrap.source);
    }

    let job_id = format!("job-{}", state.0.next_job.fetch_add(1, Ordering::Relaxed));
    if !try_acquire_job_slot(&state) {
        return failed_status(
            job_id,
            requested_at,
            AnalysisJobErrorCode::EngineUnavailable,
            "Analysis queue is full. Please wait for a running job to finish.",
        );
    }
    let queued = AnalysisJobStatus {
        job_id: job_id.clone(),
        state: AnalysisJobState::Queued,
        requested_at: requested_at.clone(),
        updated_at: requested_at.clone(),
        progress_label: Some("Queued for analysis".into()),
        progress_stage: Some(AnalysisJobStage::Queued),
        progress_percent: Some(0),
        cache_status: Some(AnalysisCacheStatus::Disabled),
        result: None,
        error: None,
    };
    store_status_and_emit(&state, &app, &queued);

    let app_state = state.inner().clone();
    let worker_app_handle = app.clone();
    std::thread::spawn(move || {
        store_status_and_emit(
            &app_state,
            &worker_app_handle,
            &AnalysisJobStatus {
                job_id: job_id.clone(),
                state: AnalysisJobState::Running,
                requested_at: requested_at.clone(),
                updated_at: iso_timestamp_now(),
                progress_label: Some("Running analysis".into()),
                progress_stage: Some(AnalysisJobStage::Decode),
                progress_percent: Some(10),
                cache_status: None,
                result: None,
                error: None,
            },
        );
        let finished = run_analysis_engine(
            app_state.clone(),
            worker_app_handle.clone(),
            job_id,
            parsed_request,
            requested_at,
        );
        store_status_and_emit(&app_state, &worker_app_handle, &finished);
        release_job_slot(&app_state);
    });

    queued
}

#[tauri::command]
fn get_analysis_job_status(job_id: String, state: tauri::State<'_, AppState>) -> AnalysisJobStatus {
    state
        .0
        .jobs
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(&job_id).cloned())
        .unwrap_or_else(|| {
            failed_status(
                job_id,
                iso_timestamp_now(),
                AnalysisJobErrorCode::NotFound,
                "Analysis job was not found.",
            )
        })
}

#[tauri::command]
fn select_local_audio_source(
    app: tauri::AppHandle<impl Runtime>,
    state: tauri::State<'_, AppState>,
) -> Result<ProjectBootstrapSummaryPayload, String> {
    let path = FileDialog::new()
        .add_filter("Audio", &AUDIO_EXTENSIONS)
        .pick_file()
        .ok_or_else(|| "Choose a WAV, MP3, FLAC, or M4A file to start analysis.".to_string())?;
    let source = normalize_local_audio_source(&path)?;
    let project_id = next_project_id(&state);
    let project_root = app_owned_root(&app, "projects", &project_id)?;
    let cache_root = app_owned_root(&app, "cache", &project_id)?;
    let temp_root = app_owned_root(&app, "temp", &project_id)?;

    let summary = ProjectBootstrapSummaryPayload {
        project_id,
        source_mode: "reference".into(),
        project_root: project_root.to_string_lossy().into_owned(),
        cache_root: cache_root.to_string_lossy().into_owned(),
        temp_root: temp_root.to_string_lossy().into_owned(),
        source,
    };
    store_bootstrap_source(&state, summary.clone());

    Ok(summary)
}

#[tauri::command]
async fn import_youtube_url(
    url: String,
    app: tauri::AppHandle<impl Runtime>,
    state: tauri::State<'_, AppState>,
) -> Result<ProjectBootstrapSummaryPayload, String> {
    if !is_supported_youtube_url(&url) {
        return Err("Only standard YouTube URLs are supported.".to_string());
    }

    let project_id = next_project_id(&state);
    let project_root = app_owned_root(&app, "projects", &project_id)?;
    let cache_root = app_owned_root(&app, "cache", &project_id)?;
    let temp_root = app_owned_root(&app, "temp", &project_id)?;

    let (working_dir, program, mut args) = analysis_command();
    if program == MISSING_ANALYSIS_PYTHON {
        return Err("Analysis engine is unavailable.".to_string());
    }

    // Replace `bandscope_analysis.cli` with `bandscope_analysis.youtube`
    if let Some(pos) = args.iter().position(|a| a == "bandscope_analysis.cli") {
        args[pos] = "bandscope_analysis.youtube".into();
    } else {
        return Err("Internal error: Could not construct YouTube import command.".to_string());
    }
    args.push("--url".into());
    args.push(url.clone());
    args.push("--out-dir".into());
    args.push(cache_root.to_string_lossy().into_owned());

    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(program);
        command.args(args).current_dir(working_dir);
        wait_for_process_output(
            command,
            YOUTUBE_IMPORT_TIMEOUT,
            ANALYSIS_WAIT_POLL,
            "YouTube import timed out.",
        )
    })
    .await
    .map_err(|_| "Failed to execute YouTube import process.".to_string())??;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|_| "Failed to parse YouTube import response.".to_string())?;

    if parsed.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        if let Some(metadata) = parsed.get("metadata") {
            let source = youtube_source_from_metadata(metadata, &cache_root)?;

            let summary = ProjectBootstrapSummaryPayload {
                project_id,
                source_mode: "reference".into(),
                project_root: project_root.to_string_lossy().into_owned(),
                cache_root: cache_root.to_string_lossy().into_owned(),
                temp_root: temp_root.to_string_lossy().into_owned(),
                source,
            };
            store_bootstrap_source(&state, summary.clone());
            return Ok(summary);
        }
        return Err(youtube_missing_metadata_error(&parsed));
    }

    if let Some(err) = parsed.get("error") {
        let msg = err
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error during YouTube import.");
        return Err(msg.to_string());
    }

    Err("YouTube import failed with an unknown error.".to_string())
}

fn is_supported_youtube_url(url: &str) -> bool {
    let parsed_url = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if parsed_url.scheme() != "https" {
        return false;
    }

    let host = parsed_url.host_str().unwrap_or("").to_lowercase();
    if host == "youtu.be" {
        let mut segments = match parsed_url.path_segments() {
            Some(s) => s.filter(|segment| !segment.is_empty()),
            None => return false,
        };
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

fn youtube_missing_metadata_error(_parsed: &Value) -> String {
    "YouTube import reported ok but missing metadata.".to_string()
}

fn wait_for_process_output(
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
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Failed to execute YouTube import process.".to_string());
    };
    let Some(stderr) = child.stderr.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Failed to execute YouTube import process.".to_string());
    };
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
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_reader
                    .join()
                    .map_err(|_| "Failed to execute YouTube import process.".to_string())?
                    .map_err(|_| "Failed to execute YouTube import process.".to_string())?;
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
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return Err(timeout_message.to_string());
                }
                thread::sleep(poll_interval);
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err("Failed to execute YouTube import process.".to_string());
            }
        }
    }
}

fn is_youtube_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn project_payload_from_content(content: &str) -> Result<RehearsalSongPayload, String> {
    if let Ok(parsed) = serde_json::from_str::<RehearsalSongPayload>(content) {
        return Ok(parsed);
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

    serde_json::from_value(payload).map_err(|_| "Invalid project file format".to_string())
}

#[tauri::command]
fn save_project(payload: Value) -> Result<(), String> {
    let parsed = serde_json::from_value::<RehearsalSongPayload>(payload)
        .map_err(|_| "Invalid project payload".to_string())?;

    let path = FileDialog::new()
        .add_filter("BandScope Project", &["bscope", "json"])
        .save_file()
        .ok_or_else(|| "User cancelled".to_string())?;

    let content = serde_json::to_string_pretty(&parsed)
        .map_err(|_| "Failed to serialize project".to_string())?;
    std::fs::write(path, content).map_err(|_| "Failed to write file".to_string())?;

    Ok(())
}

#[tauri::command]
fn load_project() -> Result<RehearsalSongPayload, String> {
    let path = FileDialog::new()
        .add_filter("BandScope Project", &["bscope", "json"])
        .pick_file()
        .ok_or_else(|| "User cancelled".to_string())?;

    let metadata = std::fs::metadata(&path).map_err(|_| "Failed to read file".to_string())?;
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("Project file is too large (exceeds 5MB limit)".to_string());
    }

    let content = std::fs::read_to_string(path).map_err(|_| "Failed to read file".to_string())?;
    project_payload_from_content(&content)
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn parse_request_payload_rejects_path_traversal() {
        let payload = json!({
            "sourceKind": "local_audio",
            "projectId": "../malicious-project",
            "sourceLabel": "My Song",
            "roleFocus": ["lead-vocal"],
        });

        let result = parse_request_payload(payload);

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            "Invalid analysis job request: invalid field 'projectId'"
        );
    }

    #[test]
    fn parse_request_payload_rejects_path_traversal_forward_slash() {
        let payload = json!({
            "sourceKind": "local_audio",
            "projectId": "/malicious-project",
            "sourceLabel": "My Song",
            "roleFocus": ["lead-vocal"],
        });

        let result = parse_request_payload(payload);

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            "Invalid analysis job request: invalid field 'projectId'"
        );
    }

    #[test]
    fn rehearsal_song_payload_accepts_shared_section_contract() {
        let payload = shared_contract_payload(json!({ "start": 10, "end": 30 }));

        let parsed = serde_json::from_value::<RehearsalSongPayload>(payload)
            .expect("shared rehearsal song contract should deserialize in Tauri");

        assert_eq!(parsed.sections[0].id, "verse-1");
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
        if std::env::var_os("BANDSCOPE_TEST_CHILD_SLEEP").is_some() {
            thread::sleep(Duration::from_secs(5));
            return;
        }

        let current_test_binary = std::env::current_exe().expect("test binary should resolve");
        let mut command = Command::new(current_test_binary);
        command
            .env("BANDSCOPE_TEST_CHILD_SLEEP", "1")
            .arg("--exact")
            .arg("tests::youtube_process_timeout_kills_and_reaps_child")
            .arg("--nocapture");

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
        let outside_file = outside_root.join("downloaded.m4a");
        std::fs::write(&inside_file, b"audio").expect("inside file should be written");
        std::fs::write(&empty_file, b"").expect("empty file should be written");
        std::fs::write(&unsupported_file, b"not audio")
            .expect("unsupported file should be written");
        std::fs::write(&outside_file, b"audio").expect("outside file should be written");

        let accepted = youtube_source_from_metadata(
            &json!({ "filepath": inside_file, "title": "Live/Test" }),
            &cache_root,
        )
        .expect("in-cache supported audio should be accepted");
        assert_eq!(accepted.extension, "m4a");
        assert_eq!(accepted.file_name, "Live_Test.m4a");

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
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            select_local_audio_source,
            import_youtube_url,
            start_analysis_job,
            get_analysis_job_status,
            save_project,
            load_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
