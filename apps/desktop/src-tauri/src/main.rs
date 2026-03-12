#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Clone)]
struct AppState(Arc<AppStateInner>);

struct AppStateInner {
    next_job: AtomicU64,
    in_flight_jobs: AtomicUsize,
    jobs: Mutex<HashMap<String, AnalysisJobStatus>>,
}

const MAX_IN_FLIGHT_JOBS: usize = 2;

impl Default for AppState {
    fn default() -> Self {
        Self(Arc::new(AppStateInner {
            next_job: AtomicU64::new(1),
            in_flight_jobs: AtomicUsize::new(0),
            jobs: Mutex::new(HashMap::new()),
        }))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnalysisJobRequest {
    source_kind: String,
    source_label: String,
    role_focus: Vec<String>,
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
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RehearsalSectionPayload {
    id: String,
    label: String,
    groove: String,
    confidence: ConfidencePayload,
    roles: Vec<RehearsalRolePayload>,
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
    result: Option<RehearsalSongPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<AnalysisJobError>,
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
            for ancestor in parent.ancestors() {
                unique_push(&mut roots, ancestor.to_path_buf());
            }
            unique_push(&mut roots, parent.join("resources"));
            unique_push(&mut roots, parent.join("../Resources"));
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        for ancestor in current_dir.ancestors() {
            unique_push(&mut roots, ancestor.to_path_buf());
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
            if candidate.exists() {
                return (
                    root,
                    candidate.to_string_lossy().into_owned(),
                    vec!["-m".into(), "bandscope_analysis.cli".into()],
                );
            }
        }
    }

    let working_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    (
        working_dir,
        "uv".into(),
        vec![
            "run".into(),
            "--project".into(),
            "services/analysis-engine".into(),
            "python".into(),
            "-m".into(),
            "bandscope_analysis.cli".into(),
        ],
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

fn parse_request_payload(payload: Value) -> Result<AnalysisJobRequest, String> {
    let Value::Object(map) = payload else {
        return Err("Invalid analysis job request: invalid field 'root'".into());
    };

    for key in map.keys() {
        if key != "sourceKind" && key != "sourceLabel" && key != "roleFocus" {
            return Err(format!(
                "Invalid analysis job request: invalid field '{key}'"
            ));
        }
    }

    let source_kind = map.get("sourceKind").and_then(Value::as_str);
    let source_label = map.get("sourceLabel").and_then(Value::as_str);
    let role_focus = map.get("roleFocus").and_then(Value::as_array);

    if source_kind != Some("demo") {
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

    Ok(AnalysisJobRequest {
        source_kind: "demo".into(),
        source_label: source_label.to_string(),
        role_focus: parsed_role_focus,
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
        result: None,
        error: Some(AnalysisJobError {
            code,
            message: message.into(),
        }),
    }
}

fn store_status(state: &AppState, status: AnalysisJobStatus) {
    if let Ok(mut jobs) = state.0.jobs.lock() {
        jobs.insert(status.job_id.clone(), status);
    }
}

fn run_analysis_engine(
    job_id: String,
    request: AnalysisJobRequest,
    requested_at: String,
) -> AnalysisJobStatus {
    let (working_dir, program, args) = analysis_command();
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
        "jobId": job_id,
        "request": request,
    });

    if let Some(stdin) = process.stdin.as_mut() {
        if stdin.write_all(payload.to_string().as_bytes()).is_err() {
            let _ = process.kill();
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

    let output = match process.wait_with_output() {
        Ok(output) => output,
        Err(_) => {
            return failed_status(
                payload["jobId"]
                    .as_str()
                    .unwrap_or("unknown-job")
                    .to_string(),
                requested_at,
                AnalysisJobErrorCode::EngineUnavailable,
                "Analysis engine is unavailable.",
            )
        }
    };

    if !output.status.success() {
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

    serde_json::from_slice::<AnalysisJobStatus>(&output.stdout).unwrap_or_else(|_| {
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
fn start_analysis_job(request: Value, state: tauri::State<'_, AppState>) -> AnalysisJobStatus {
    let requested_at = iso_timestamp_now();
    let parsed_request = match parse_request_payload(request) {
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
        result: None,
        error: None,
    };
    store_status(&state, queued.clone());

    let app_state = state.inner().clone();
    std::thread::spawn(move || {
        store_status(
            &app_state,
            AnalysisJobStatus {
                job_id: job_id.clone(),
                state: AnalysisJobState::Running,
                requested_at: requested_at.clone(),
                updated_at: iso_timestamp_now(),
                progress_label: Some("Running analysis".into()),
                result: None,
                error: None,
            },
        );
        let finished = run_analysis_engine(job_id, parsed_request, requested_at);
        store_status(&app_state, finished);
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

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_analysis_job,
            get_analysis_job_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
