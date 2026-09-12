#[test]
fn analysis_terminal_parent_exit_cleans_owned_descendants_before_reader_join() {
    let source = include_str!("../src/main.rs");
    let core_runtime = include_str!("../../core/tests/youtube_process_containment.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis process runner must remain present");
    let runner_tail = &source[runner_start..];
    let runner_end = runner_tail
        .find("\n}\n\n#[tauri::command]\nfn start_analysis_job")
        .expect("analysis process runner boundary must remain inspectable");
    let runner = &runner_tail[..runner_end];

    let terminal_arm_start = runner
        .find("Ok(Some(status)) => {")
        .expect("analysis runner must handle direct-parent terminal status");
    let terminal_arm_tail = &runner[terminal_arm_start..];
    let terminal_arm_end = terminal_arm_tail
        .find("\n            Ok(None) =>")
        .expect("terminal-status arm must remain bounded before the running-process arm");
    let terminal_arm = &terminal_arm_tail[..terminal_arm_end];

    assert!(
        terminal_arm.contains("terminate_owned_process(&mut process)"),
        "direct-parent terminal status must clean residual owned descendants before inherited stdout/stderr readers are joined"
    );
    assert!(
        terminal_arm.contains("exit_status = status;") && terminal_arm.contains("break;"),
        "descendant cleanup must preserve the directly owned process exit status as product truth"
    );

    let cleanup = terminal_arm
        .find("terminate_owned_process(&mut process)")
        .expect("terminal cleanup must remain in the terminal arm");
    let terminal_reader_join = runner
        .rfind("stdout_reader.join()")
        .expect("analysis success path must still join its stdout reader after process control");
    assert!(
        terminal_arm_start + cleanup < terminal_reader_join,
        "owned descendant cleanup must happen before the analysis success path joins inherited output readers"
    );

    assert!(
        core_runtime.contains("fn youtube_success_terminates_descendant_that_keeps_output_pipe_open()"),
        "the shared process owner must retain an executable successful-parent descendant-pipe regression"
    );
}
