//! Native file consent and temporary-source ownership for Basic Pitch drafts.

use super::{
    analysis_command, app_owned_root, materialize_local_audio_source, release_job_slot,
    try_acquire_job_slot,
};
use bandscope_desktop_core::{
    next_project_id, run_transcription_process, AppState, TranscriptionDraft,
    TranscriptionExportState, TranscriptionState, MAX_TRANSCRIPTION_AUDIO_BYTES,
    MISSING_ANALYSIS_PYTHON, TRANSCRIPTION_TIMEOUT,
};
use rfd::FileDialog;
use serde_json::json;
use std::{path::PathBuf, process::Command};
use tauri::Runtime;

const TRANSCRIPTION_EXTENSIONS: [&str; 3] = ["wav", "mp3", "flac"];

struct JobSlot(AppState);

impl Drop for JobSlot {
    fn drop(&mut self) {
        release_job_slot(&self.0);
    }
}

struct TemporarySource(PathBuf);

impl TemporarySource {
    fn cleanup(&self) -> Result<(), String> {
        std::fs::remove_dir_all(&self.0).map_err(|_| "transcription_cleanup_failed".to_string())
    }
}

impl Drop for TemporarySource {
    fn drop(&mut self) {
        // The path is minted by the native owner, never supplied by the renderer.
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[tauri::command]
pub async fn transcribe_recording(
    app: tauri::AppHandle<impl Runtime>,
    state: tauri::State<'_, AppState>,
    transcription_state: tauri::State<'_, TranscriptionState>,
    export_state: tauri::State<'_, TranscriptionExportState>,
) -> Result<Option<TranscriptionDraft>, String> {
    let lease = transcription_state.begin().map_err(str::to_string)?;
    if !try_acquire_job_slot(&state) {
        return Err("transcription_busy".into());
    }
    let state = state.inner().clone();
    let export_state = export_state.inner().clone();
    let slot = JobSlot(state.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let _slot = slot;
        let (working_dir, program, mut args) = analysis_command();
        if program == MISSING_ANALYSIS_PYTHON {
            return Err("transcription_unavailable".into());
        }
        let module_index = args
            .iter()
            .position(|arg| arg == "bandscope_analysis.cli")
            .ok_or_else(|| "transcription_unavailable".to_string())?;
        args[module_index] = "bandscope_analysis.transcription.cli".into();
        let Some(path) = FileDialog::new()
            .set_title("Choose a single-instrument recording for a MIDI draft")
            .add_filter("Audio", &TRANSCRIPTION_EXTENSIONS)
            .pick_file()
        else {
            return Ok(None);
        };
        if lease.is_cancelled() {
            return Err("transcription_cancelled".into());
        }
        let metadata = path
            .metadata()
            .map_err(|_| "audio_unavailable".to_string())?;
        let supported = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                TRANSCRIPTION_EXTENSIONS
                    .iter()
                    .any(|allowed| extension.eq_ignore_ascii_case(allowed))
            });
        if !supported
            || !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > MAX_TRANSCRIPTION_AUDIO_BYTES
        {
            return Err("audio_rejected".into());
        }

        let project_id = next_project_id(&state);
        let root = app_owned_root(&app, "temp", &project_id)
            .map_err(|_| "audio_unavailable".to_string())?;
        let temporary = TemporarySource(root);
        let result = (|| {
            // Consume the canonical copy/receipt implementation without changing its owner.
            let (source, _identity) =
                materialize_local_audio_source(&path, &temporary.0, &project_id)
                    .map_err(|_| "audio_rejected".to_string())?;
            if source.file_size_bytes > MAX_TRANSCRIPTION_AUDIO_BYTES {
                return Err("audio_rejected".into());
            }
            let request = serde_json::to_vec(&json!({"sourcePath": source.source_path}))
                .map_err(|_| "invalid_request".to_string())?;
            let mut command = Command::new(program);
            command.args(args).current_dir(working_dir);
            let mut draft =
                run_transcription_process(command, &request, &lease, TRANSCRIPTION_TIMEOUT)
                    .map_err(str::to_string)?;
            draft.source_label = if source.file_name.len() <= 255
                && !source
                    .file_name
                    .chars()
                    .any(|c| c.is_control() || c == '/' || c == '\\')
            {
                source.file_name
            } else {
                "recording".into()
            };
            draft.validate().map_err(str::to_string)?;
            Ok(Some(draft))
        })();
        temporary.cleanup()?;
        if lease.is_cancelled() {
            return Err("transcription_cancelled".into());
        }
        if let Ok(Some(ref draft)) = result {
            export_state.publish(draft).map_err(str::to_string)?;
        }
        result
    })
    .await
    .map_err(|_| "transcription_failed".to_string())?
}

#[tauri::command]
pub fn cancel_transcription(state: tauri::State<'_, TranscriptionState>) -> bool {
    state.cancel()
}
