#[test]
fn analysis_progress_cannot_replace_native_requested_at() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis runner must remain present");
    let runner_end = source[runner_start..]
        .find("\n#[tauri::command]\nfn start_analysis_job")
        .map(|offset| runner_start + offset)
        .expect("analysis runner must end before the start command");
    let runner = &source[runner_start..runner_end];

    assert!(
        runner.contains("\"requestedAt\": requested_at.clone()"),
        "native analysis must pass its authoritative request timestamp to the helper envelope"
    );
    assert!(
        runner.contains("let expected_requested_at = requested_at.clone()"),
        "native analysis must retain its request timestamp before reading helper progress"
    );

    let stdout_reader_start = runner
        .find("let stdout_reader = thread::spawn")
        .expect("analysis stdout reader must remain present");
    let stdout_reader_end = runner[stdout_reader_start..]
        .find("let stderr_reader = thread::spawn")
        .map(|offset| stdout_reader_start + offset)
        .expect("analysis stderr reader must follow stdout reader");
    let stdout_reader = &runner[stdout_reader_start..stdout_reader_end];

    let timestamp_guard = stdout_reader
        .find("status.requested_at != expected_requested_at")
        .expect("helper status must be bound to the native request timestamp");
    let status_publish = stdout_reader
        .find("status_tx.send(status)")
        .expect("valid helper progress must still reach the native status channel");
    assert!(
        timestamp_guard < status_publish,
        "requestedAt authority must be checked before helper progress can be stored or emitted"
    );
    assert!(
        stdout_reader[timestamp_guard..status_publish].contains("send(())"),
        "requestedAt mismatch must wake the existing process-control owner and fail closed"
    );
}
