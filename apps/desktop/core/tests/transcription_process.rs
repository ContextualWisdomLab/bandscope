//! Exercise the actual owned-process transport without an audio model or network.

use bandscope_desktop_core::{run_transcription_process, TranscriptionState};
use std::{
    process::Command,
    thread,
    time::{Duration, Instant},
};

const REQUEST: &[u8] = br#"{"sourcePath":"/native/source.wav"}"#;

fn command(mode: &str) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_bandscope-transcription-test-helper"));
    command.arg(mode);
    command
}

#[test]
fn request_reaches_stdin_and_success_is_validated_after_both_pipes_drain() {
    for mode in ["success", "dual-pipe"] {
        let lease = TranscriptionState::default().begin().unwrap();
        let draft =
            run_transcription_process(command(mode), REQUEST, &lease, Duration::from_secs(5))
                .expect("valid draft and bounded diagnostics must not deadlock");
        assert_eq!(draft.source_label, "source.wav");
        assert!(draft.notes.is_empty());
    }
}

#[test]
fn malformed_output_and_private_child_errors_are_not_forwarded() {
    for (mode, expected) in [
        ("error", "audio_rejected"),
        ("unknown-error", "transcription_output_invalid"),
        ("invalid-json", "transcription_output_invalid"),
        ("stdout-overflow", "transcription_output_invalid"),
        ("stderr-overflow", "transcription_output_invalid"),
    ] {
        let lease = TranscriptionState::default().begin().unwrap();
        let started = Instant::now();
        let error =
            run_transcription_process(command(mode), REQUEST, &lease, Duration::from_secs(5))
                .unwrap_err();
        assert_eq!(error, expected, "{mode}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "{mode} must terminate promptly"
        );
    }
}

#[test]
fn deadline_terminates_the_child_and_releases_the_job_when_lease_drops() {
    let state = TranscriptionState::default();
    let lease = state.begin().unwrap();
    let started = Instant::now();
    let error =
        run_transcription_process(command("hold"), REQUEST, &lease, Duration::from_millis(100))
            .unwrap_err();
    assert_eq!(error, "transcription_timed_out");
    assert!(started.elapsed() < Duration::from_secs(5));
    assert!(state.begin().is_err());
    drop(lease);
    assert!(state.begin().is_ok());
}

#[test]
fn cancellation_terminates_an_already_running_child() {
    let state = TranscriptionState::default();
    let lease = state.begin().unwrap();
    let ready = std::env::temp_dir().join(format!(
        "bandscope-transcription-{}.ready",
        uuid::Uuid::new_v4()
    ));
    let mut child_command = command("hold");
    child_command.arg(&ready);
    let cancellation = state.clone();
    let ready_for_thread = ready.clone();
    let cancel = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ready_for_thread.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        let child_started = ready_for_thread.exists();
        cancellation.cancel();
        child_started
    });
    let result = run_transcription_process(child_command, REQUEST, &lease, Duration::from_secs(8));
    let child_started = cancel.join().unwrap();
    let _ = std::fs::remove_file(ready);
    assert!(child_started, "cancellation must exercise a running child");
    assert_eq!(result.unwrap_err(), "transcription_cancelled");
}

#[test]
fn successful_direct_exit_terminates_pipe_holding_descendants_before_join() {
    let lease = TranscriptionState::default().begin().unwrap();
    let started = Instant::now();
    let result = run_transcription_process(
        command("descendant"),
        REQUEST,
        &lease,
        Duration::from_secs(5),
    );
    assert!(result.is_ok());
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn invalid_request_and_prior_cancellation_do_not_spawn_a_child() {
    let state = TranscriptionState::default();
    let lease = state.begin().unwrap();
    for request in [Vec::new(), vec![b'x'; 4097]] {
        assert_eq!(
            run_transcription_process(
                Command::new("missing-transcription-fixture"),
                &request,
                &lease,
                Duration::from_secs(1)
            )
            .unwrap_err(),
            "invalid_request"
        );
    }
    state.cancel();
    assert_eq!(
        run_transcription_process(
            Command::new("missing-transcription-fixture"),
            REQUEST,
            &lease,
            Duration::from_secs(1)
        )
        .unwrap_err(),
        "transcription_cancelled"
    );
}
