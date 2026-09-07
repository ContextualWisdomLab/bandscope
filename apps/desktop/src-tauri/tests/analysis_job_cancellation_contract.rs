#[test]
fn native_analysis_cancellation_reaches_the_running_child_boundary() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis process runner must remain present");
    let runner_tail = &source[runner_start..];
    let runner_end = runner_tail
        .find("\n}\n\n#[tauri::command]\nfn start_analysis_job")
        .expect("analysis process runner boundary must remain inspectable");
    let runner = &runner_tail[..runner_end];

    assert!(
        runner.contains("cancellation_state.is_requested(&job_id)"),
        "the native runner must observe cancellation at the process boundary"
    );
    assert!(
        runner.contains("process.kill()") && runner.contains("process.wait()"),
        "accepted cancellation must kill and reap the owned analysis child before reporting terminal status"
    );
    assert!(
        runner.contains("cancelled_status("),
        "process cancellation must end in a dedicated machine-readable cancellation status"
    );
}

#[test]
fn cancellation_is_an_allowlisted_job_specific_tauri_command() {
    let source = include_str!("../src/main.rs");

    assert!(
        source.contains("fn cancel_analysis_job("),
        "the renderer boundary needs one job-specific cancellation command rather than generic process authority"
    );
    assert!(
        source.contains("cancel_analysis_job,\n            save_project"),
        "the cancellation command must be explicitly registered in the Tauri allowlist"
    );
    assert!(
        source.contains("AnalysisJobCancellationRegistry::default()"),
        "cancellation requests need a native state owner shared by commands and the worker"
    );
    assert!(
        source.contains("AnalysisJobErrorCode::Cancelled"),
        "cancelled work must not be mislabeled as an unavailable engine"
    );
}
