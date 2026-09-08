#[test]
fn analysis_helper_cannot_publish_terminal_or_queued_state_before_native_exit() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis process runner must remain present");
    let runner_end = source[runner_start..]
        .find("\n#[tauri::command]\nfn start_analysis_job")
        .map(|offset| runner_start + offset)
        .expect("analysis process runner must end before the start command");
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

#[test]
fn analysis_status_payload_semantics_are_validated_before_native_state_mutation() {
    let source = include_str!("../src/main.rs");
    let validator_start = source
        .find("fn analysis_status_payload_is_valid(")
        .expect("analysis status payload semantics must have one native validator");
    let validator_end = source[validator_start..]
        .find("\nfn drain_analysis_status_updates(")
        .map(|offset| validator_start + offset)
        .expect("status payload validator must remain beside the native analysis protocol owner");
    let validator = &source[validator_start..validator_end];

    assert!(
        validator.contains("progress_percent") && validator.contains("> 100"),
        "native analysis status admission must enforce the shared 0..=100 progress contract"
    );
    assert!(
        validator.contains("AnalysisJobState::Queued | AnalysisJobState::Running")
            && validator.contains("status.result.is_none()")
            && validator.contains("status.error.is_none()"),
        "non-terminal helper status must not carry terminal result/error payloads"
    );
    assert!(
        validator.contains("AnalysisJobState::Succeeded")
            && validator.contains("status.result.is_some()"),
        "Succeeded helper status must carry a result before native acceptance"
    );
    assert!(
        validator.contains("AnalysisJobState::Failed") && validator.contains("status.error.is_some()"),
        "Failed helper status must carry an error before native acceptance"
    );

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

    let semantic_guard = stdout_reader
        .find("!analysis_status_payload_is_valid(&status)")
        .expect("typed analysis status must pass semantic payload admission");
    let terminal_retention = stdout_reader
        .find("last_status = Some(status)")
        .expect("terminal candidate retention must remain present");
    let running_publish = stdout_reader
        .find("status_tx.send(status)")
        .expect("running progress publication must remain present");
    assert!(
        semantic_guard < terminal_retention && semantic_guard < running_publish,
        "semantic payload admission must happen before terminal retention or running status publication"
    );
}

#[test]
fn analysis_protocol_rejection_survives_child_exit_race() {
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

    let rejection_to_join = stdout_reader
        .rfind("if protocol_rejected")
        .map(|offset| &stdout_reader[offset..])
        .expect("analysis stdout reader must retain explicit protocol rejection state");
    let reader_return = rejection_to_join
        .find("(last_status, result)")
        .expect("analysis stdout reader must return terminal candidate and transport result together");
    let rejection_result = &rejection_to_join[..reader_return];

    assert!(
        rejection_result.contains("std::io::ErrorKind::InvalidData")
            && rejection_result.contains("Err("),
        "protocol rejection must become a failing reader join result so a fast child exit cannot outrun the side-channel failure notification and admit a rejected terminal status"
    );
}
