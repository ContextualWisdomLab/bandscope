#[test]
fn successful_analysis_process_requires_terminal_engine_status() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis runner must remain present");
    let runner_end = source[runner_start..]
        .find("\n#[tauri::command]\nfn start_analysis_job")
        .map(|offset| runner_start + offset)
        .expect("analysis runner must end before the start command");
    let runner = &source[runner_start..runner_end];
    let successful_exit_start = runner
        .rfind("if !exit_status.success()")
        .expect("analysis runner must reject a failed child exit");
    let successful_exit_completion = &runner[successful_exit_start..];

    assert!(
        successful_exit_completion.contains("AnalysisJobState::Succeeded")
            && successful_exit_completion.contains("AnalysisJobState::Failed"),
        "a zero exit code must not promote a queued/running progress record to terminal truth"
    );
    assert!(
        successful_exit_completion.contains("Analysis engine returned a non-terminal response."),
        "a successful child exit without a terminal status must fail closed"
    );
    assert!(
        !successful_exit_completion.contains("last_status.unwrap_or_else"),
        "the last progress record must not be accepted as completion merely because the child exited zero"
    );
}
