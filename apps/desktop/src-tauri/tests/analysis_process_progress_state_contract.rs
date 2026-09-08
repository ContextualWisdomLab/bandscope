#[test]
fn analysis_helper_cannot_publish_terminal_or_queued_state_before_native_exit() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis runner must remain present");
    let runner_end = source[runner_start..]
        .find("\n#[tauri::command]\nfn start_analysis_job")
        .map(|offset| runner_start + offset)
        .expect("analysis runner must end before the start command");
    let runner = &source[runner_start..runner_end];

    let stdout_reader_start = runner
        .find("let stdout_reader = thread::spawn")
        .expect("analysis stdout reader must remain present");
    let stdout_reader_end = runner[stdout_reader_start..]
        .find("let stderr_reader = thread::spawn")
        .map(|offset| stdout_reader_start + offset)
        .expect("analysis stderr reader must follow stdout reader");
    let stdout_reader = &runner[stdout_reader_start..stdout_reader_end];

    assert!(
        stdout_reader.contains("AnalysisJobState::Running"),
        "only helper Running progress may be published before the owned process exits"
    );
    assert!(
        stdout_reader.contains("AnalysisJobState::Succeeded | AnalysisJobState::Failed"),
        "helper terminal state must be recognized separately from streaming progress"
    );

    let running_guard = stdout_reader
        .find("AnalysisJobState::Running")
        .expect("running progress guard must remain present");
    let status_publish = stdout_reader
        .find("status_tx.send(status)")
        .expect("valid running progress must still reach the native status channel");
    assert!(
        running_guard < status_publish,
        "state must be validated before helper progress reaches the native status channel"
    );

    let terminal_guard = stdout_reader
        .find("AnalysisJobState::Succeeded | AnalysisJobState::Failed")
        .expect("terminal state guard must remain present");
    assert!(
        terminal_guard < status_publish,
        "terminal-state handling must be selected before any pre-exit status publication"
    );
    assert!(
        stdout_reader[terminal_guard..status_publish].contains("last_status = Some(status)"),
        "terminal helper status must be retained for post-exit validation rather than emitted early"
    );
    assert!(
        stdout_reader.contains("_ =>") && stdout_reader.contains("send(())"),
        "queued or otherwise invalid helper state must wake the existing process-control owner"
    );
}

#[test]
fn malformed_analysis_jsonl_fails_closed_before_native_state_mutation() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis runner must remain present");
    let runner_end = source[runner_start..]
        .find("\n#[tauri::command]\nfn start_analysis_job")
        .map(|offset| runner_start + offset)
        .expect("analysis runner must end before the start command");
    let runner = &source[runner_start..runner_end];

    let stdout_reader_start = runner
        .find("let stdout_reader = thread::spawn")
        .expect("analysis stdout reader must remain present");
    let stdout_reader_end = runner[stdout_reader_start..]
        .find("let stderr_reader = thread::spawn")
        .map(|offset| stdout_reader_start + offset)
        .expect("analysis stderr reader must follow stdout reader");
    let stdout_reader = &runner[stdout_reader_start..stdout_reader_end];

    assert!(
        stdout_reader.contains("match serde_json::from_str::<AnalysisJobStatus>(line)"),
        "analysis JSONL must handle deserialization failure explicitly instead of silently ignoring malformed protocol lines"
    );
    assert!(
        stdout_reader.contains("Err(_) =>") && stdout_reader.contains("stdout_failure_tx.send(())"),
        "malformed analysis JSONL must wake the existing process-control owner and fail closed"
    );
}
