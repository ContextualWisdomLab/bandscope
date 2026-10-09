//! Bounded MIDI-draft transport over the existing owned-process boundary.

use crate::{read_bounded_process_output, spawn_owned_process, MAX_PROCESS_OUTPUT_BYTES};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

pub const BASIC_PITCH_MODEL_SHA256: &str =
    "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec";
pub const MAX_TRANSCRIPTION_AUDIO_BYTES: u64 = 50 * 1024 * 1024;
pub const TRANSCRIPTION_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_MIDI_BASE64_BYTES: usize = 4 * (262_144_usize.div_ceil(3));
const OUTPUT_INVALID: &str = "transcription_output_invalid";

#[derive(Clone, Default)]
pub struct TranscriptionState(Arc<Mutex<Option<Arc<AtomicBool>>>>);

/// Holds the single transcription slot until its child and temporary source are gone.
pub struct TranscriptionLease {
    state: TranscriptionState,
    cancelled: Arc<AtomicBool>,
}

impl TranscriptionState {
    pub fn begin(&self) -> Result<TranscriptionLease, &'static str> {
        let mut slot = self.0.lock().map_err(|_| "transcription_busy")?;
        if slot.is_some() {
            return Err("transcription_busy");
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        *slot = Some(cancelled.clone());
        Ok(TranscriptionLease {
            state: self.clone(),
            cancelled,
        })
    }

    pub fn cancel(&self) -> bool {
        let Ok(slot) = self.0.lock() else {
            return false;
        };
        match slot.as_ref() {
            Some(cancelled) => {
                cancelled.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
}

impl TranscriptionLease {
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Drop for TranscriptionLease {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.state.0.lock() {
            if slot
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, &self.cancelled))
            {
                *slot = None;
            }
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranscriptionDraft {
    pub schema_version: u8,
    pub source_label: String,
    pub duration_seconds: f64,
    pub model: TranscriptionModel,
    pub notes: Vec<TranscriptionNote>,
    pub midi_base64: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TranscriptionModel {
    pub name: String,
    pub version: String,
    pub sha256: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranscriptionNote {
    pub pitch: String,
    pub midi_pitch: u8,
    pub onset: f64,
    pub offset: f64,
    pub velocity: f64,
    pub pitch_bends: Vec<TranscriptionBend>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TranscriptionBend {
    pub time: f64,
    pub semitones: f64,
}

impl TranscriptionDraft {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != 1
            || self.source_label.trim().is_empty()
            || self.source_label.len() > 255
            || self
                .source_label
                .chars()
                .any(|c| c.is_control() || c == '/' || c == '\\')
            || self.source_label == "."
            || self.source_label == ".."
            || !self.duration_seconds.is_finite()
            || self.duration_seconds <= 0.0
            || self.duration_seconds > 120.0
            || self.model.name != "basic-pitch"
            || self.model.version != "0.4.0"
            || self.model.sha256 != BASIC_PITCH_MODEL_SHA256
            || self.notes.len() > 4096
            || self.warnings.len() > 4
            || self.warnings.iter().enumerate().any(|(index, value)| {
                !matches!(
                    value.as_str(),
                    "audio_peak_normalized"
                        | "overlapping_pitch_bends_omitted"
                        | "note_times_clipped"
                        | "out_of_range_notes_omitted"
                ) || self.warnings[..index].contains(value)
            })
        {
            return Err(OUTPUT_INVALID);
        }
        let midi = self.midi_base64.as_bytes();
        if midi.len() < 28
            || midi.len() > MAX_MIDI_BASE64_BYTES
            || midi.len() % 4 != 0
            || !midi.starts_with(b"TVRoZAAAAAY")
            || midi
                .iter()
                .any(|b| !(b.is_ascii_alphanumeric() || b"+/=".contains(b)))
            || midi[..midi.len() - 2].contains(&b'=')
            || (midi[midi.len() - 2] == b'=' && midi[midi.len() - 1] != b'=')
        {
            return Err(OUTPUT_INVALID);
        }
        let mut bend_count = 0usize;
        let mut last_onset = 0.0;
        let names = [
            "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
        ];
        for note in &self.notes {
            let expected_pitch = format!(
                "{}{}",
                names[(note.midi_pitch % 12) as usize],
                i32::from(note.midi_pitch) / 12 - 1
            );
            if note.midi_pitch > 127
                || note.pitch != expected_pitch
                || !note.onset.is_finite()
                || !note.offset.is_finite()
                || note.onset < last_onset
                || note.onset < 0.0
                || note.offset <= note.onset
                || note.offset > self.duration_seconds
                || !note.velocity.is_finite()
                || !(0.0..=1.0).contains(&note.velocity)
            {
                return Err(OUTPUT_INVALID);
            }
            last_onset = note.onset;
            bend_count += note.pitch_bends.len();
            if bend_count > 32768 {
                return Err(OUTPUT_INVALID);
            }
            let mut last_time = note.onset;
            for bend in &note.pitch_bends {
                if !bend.time.is_finite()
                    || !bend.semitones.is_finite()
                    || bend.time < last_time
                    || bend.time >= note.offset
                    || !(-2.0..=2.0).contains(&bend.semitones)
                {
                    return Err(OUTPUT_INVALID);
                }
                last_time = bend.time;
            }
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ErrorEnvelope {
    schema_version: u8,
    error: DraftError,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftError {
    code: String,
    message: String,
}

fn admitted_error(output: &[u8]) -> &'static str {
    let Ok(error) = serde_json::from_slice::<ErrorEnvelope>(output) else {
        return OUTPUT_INVALID;
    };
    if error.schema_version != 1 || error.error.message.len() > 256 {
        return OUTPUT_INVALID;
    }
    match error.error.code.as_str() {
        "invalid_request" => "invalid_request",
        "audio_unavailable" => "audio_unavailable",
        "audio_rejected" => "audio_rejected",
        "model_unavailable" => "model_unavailable",
        "model_integrity_failed" => "model_integrity_failed",
        "invalid_model_output" => "invalid_model_output",
        "transcription_too_complex" => "transcription_too_complex",
        "transcription_failed" => "transcription_failed",
        "result_too_large" => "result_too_large",
        _ => OUTPUT_INVALID,
    }
}

/// Execute only the native-selected transcription request; renderer paths never enter this API.
///
/// Process lifetime and bounded pipe capture are consumed from Resource Admission. Even after
/// the direct child exits, its ordinary descendants are terminated before joining pipe readers.
pub fn run_transcription_process(
    mut command: Command,
    request: &[u8],
    lease: &TranscriptionLease,
    timeout: Duration,
) -> Result<TranscriptionDraft, &'static str> {
    if lease.is_cancelled() {
        return Err("transcription_cancelled");
    }
    if request.is_empty() || request.len() > 4096 {
        return Err("invalid_request");
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut process = spawn_owned_process(&mut command).map_err(|_| "transcription_unavailable")?;
    let Some(stdout) = process.take_stdout() else {
        process.terminate();
        return Err("transcription_unavailable");
    };
    let Some(stderr) = process.take_stderr() else {
        process.terminate();
        return Err("transcription_unavailable");
    };
    let (failure_tx, failure_rx) = mpsc::channel();
    let stdout_failure = failure_tx.clone();
    let stdout_reader = thread::spawn(move || {
        let output = read_bounded_process_output(stdout);
        if output.is_err() {
            let _ = stdout_failure.send(());
        }
        output
    });
    let stderr_reader = thread::spawn(move || {
        let output = read_bounded_process_output(stderr);
        if output.is_err() {
            let _ = failure_tx.send(());
        }
        output
    });
    let write_ok = process
        .take_stdin()
        .is_some_and(|mut stdin| stdin.write_all(request).is_ok());
    let deadline = Instant::now() + timeout;
    let status = if !write_ok {
        Err("transcription_unavailable")
    } else {
        loop {
            if lease.is_cancelled() {
                break Err("transcription_cancelled");
            }
            if Instant::now() >= deadline {
                break Err("transcription_timed_out");
            }
            match process.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Err(_) => break Err("transcription_failed"),
                Ok(None) => {}
            }
            let wait =
                Duration::from_millis(25).min(deadline.saturating_duration_since(Instant::now()));
            match failure_rx.recv_timeout(wait) {
                Ok(()) => break Err(OUTPUT_INVALID),
                // Both pipes can close before the child exits; avoid a busy loop in that case.
                Err(mpsc::RecvTimeoutError::Disconnected) => thread::sleep(wait),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        }
    };
    process.terminate();
    let stdout = stdout_reader.join();
    let stderr = stderr_reader.join();
    let status = status?;
    let stdout = stdout
        .map_err(|_| OUTPUT_INVALID)?
        .map_err(|_| OUTPUT_INVALID)?;
    if !matches!(stderr, Ok(Ok(_))) {
        return Err(OUTPUT_INVALID);
    }
    if lease.is_cancelled() {
        return Err("transcription_cancelled");
    }
    if !status.success() {
        return Err(admitted_error(&stdout));
    }
    if stdout.len() > MAX_PROCESS_OUTPUT_BYTES {
        return Err(OUTPUT_INVALID);
    }
    let draft: TranscriptionDraft = serde_json::from_slice(&stdout).map_err(|_| OUTPUT_INVALID)?;
    draft.validate()?;
    Ok(draft)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn payload() -> Value {
        json!({"schemaVersion":1,"sourceLabel":"recording.wav","durationSeconds":2.0,
            "model":{"name":"basic-pitch","version":"0.4.0","sha256":BASIC_PITCH_MODEL_SHA256},
            "notes":[{"pitch":"C4","midiPitch":60,"onset":0.0,"offset":1.0,"velocity":0.5,
                "pitchBends":[{"time":0.25,"semitones":0.5}]}],
            "midiBase64":"TVRoZAAAAAYAAAABAeBNVHJrAAAABAD/LwA=","warnings":[]})
    }

    #[test]
    fn only_one_job_can_own_cancellation_and_the_slot_is_reusable() {
        let state = TranscriptionState::default();
        assert!(!state.cancel());
        let first = state.begin().unwrap();
        assert!(state.begin().is_err());
        assert!(state.cancel());
        assert!(first.is_cancelled());
        drop(first);
        let next = state.begin().unwrap();
        assert!(!next.is_cancelled());
    }

    #[test]
    fn model_identity_and_musical_intervals_are_admitted_together() {
        serde_json::from_value::<TranscriptionDraft>(payload())
            .unwrap()
            .validate()
            .unwrap();
        for (pointer, replacement) in [
            ("/schemaVersion", json!(2)),
            ("/sourceLabel", json!("../secret.wav")),
            ("/durationSeconds", json!(121)),
            ("/model/sha256", json!("0".repeat(64))),
            ("/notes/0/midiPitch", json!(128)),
            ("/notes/0/pitch", json!("D4")),
            ("/notes/0/onset", json!(-1)),
            ("/notes/0/offset", json!(0)),
            ("/notes/0/velocity", json!(1.1)),
            ("/notes/0/pitchBends/0/time", json!(1.0)),
            ("/notes/0/pitchBends/0/semitones", json!(2.1)),
            ("/midiBase64", json!("<script>")),
            ("/warnings", json!(["raw private path"])),
        ] {
            let mut invalid = payload();
            *invalid.pointer_mut(pointer).unwrap() = replacement;
            assert!(
                serde_json::from_value::<TranscriptionDraft>(invalid)
                    .unwrap()
                    .validate()
                    .is_err(),
                "{pointer}"
            );
        }
    }

    #[test]
    fn unknown_fields_and_nonfinite_notes_cannot_cross_to_the_renderer() {
        let mut unknown = payload();
        unknown["sourcePath"] = json!("/private/audio.wav");
        assert!(serde_json::from_value::<TranscriptionDraft>(unknown).is_err());
        let mut draft = serde_json::from_value::<TranscriptionDraft>(payload()).unwrap();
        draft.notes[0].onset = f64::NAN;
        assert!(draft.validate().is_err());
        draft.notes[0].onset = 0.0;
        draft.notes[0].pitch_bends[0].semitones = f64::INFINITY;
        assert!(draft.validate().is_err());
    }

    #[test]
    fn errors_are_allowlisted_codes_and_never_child_messages() {
        let error = json!({"schemaVersion":1,"error":{"code":"audio_rejected","message":"/private/source.wav"}});
        assert_eq!(
            admitted_error(error.to_string().as_bytes()),
            "audio_rejected"
        );
        let error =
            json!({"schemaVersion":1,"error":{"code":"/private/source.wav","message":"failed"}});
        assert_eq!(admitted_error(error.to_string().as_bytes()), OUTPUT_INVALID);
    }
}
