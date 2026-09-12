#[test]
fn analysis_progress_cannot_rekey_the_native_job() {
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
        runner[..stdout_reader_start].contains("let expected_job_id = job_id.clone()"),
        "native analysis must capture the BandScope-minted job id before trusting helper progress"
    );
    assert!(
        stdout_reader.contains("status.job_id != expected_job_id"),
        "helper JSONL for a different job id must fail closed instead of being stored or emitted"
    );

    let identity_guard = stdout_reader
        .find("status.job_id != expected_job_id")
        .expect("job-id guard must remain in the stdout reader");
    let status_publish = stdout_reader
        .find("status_tx.send(status)")
        .expect("valid helper progress must still reach the native status channel");
    assert!(
        identity_guard < status_publish,
        "job identity must be checked before helper progress can reach the native status channel"
    );
    assert!(
        stdout_reader[identity_guard..status_publish].contains("send(())"),
        "job-id mismatch must wake the existing process-control owner rather than wait for helper exit"
    );
}
