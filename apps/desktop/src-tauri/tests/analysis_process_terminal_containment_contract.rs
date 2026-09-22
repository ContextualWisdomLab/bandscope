#[test]
fn analysis_runner_uses_shared_owned_spawn_and_tree_cleanup_before_reader_join() {
    let source = include_str!("../src/main.rs");
    let owned_process_source = include_str!("../../core/src/owned_process.rs");
    let core_root = include_str!("../../core/src/root.rs");
    let native_regression = include_str!("../../core/tests/process_output_large_streams.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis process runner must remain present");
    let runner_tail = &source[runner_start..];
    let runner_end = runner_tail
        .find("\n}\n\n#[tauri::command]\nfn start_analysis_job")
        .expect("analysis process runner boundary must remain inspectable");
    let runner = &runner_tail[..runner_end];

    assert!(
        runner.contains("spawn_owned_process(&mut command)"),
        "analysis must enter the shared race-free owned-process spawn boundary before helper code can run"
    );
    assert!(
        !runner.contains("configure_owned_process(&mut command)") && !runner.contains("command.spawn()"),
        "analysis must not rebuild the old configure-then-spawn boundary outside the canonical process owner"
    );
    assert!(
        core_root.contains("spawn_owned_process") && core_root.contains("OwnedProcess"),
        "desktop core must expose the narrow owned-process capability used by the native analysis adapter"
    );
    assert!(
        owned_process_source.contains("CREATE_SUSPENDED")
            && owned_process_source.contains("assign_process_to_job_object")
            && owned_process_source.contains("terminate_job_object"),
        "Windows owned-process implementation must retain pre-execution Job Object admission and tree-wide cleanup"
    );

    let terminal_arm_start = runner
        .find("Ok(Some(status)) => {")
        .expect("analysis runner must handle direct-parent terminal status");
    let terminal_arm_tail = &runner[terminal_arm_start..];
    let terminal_arm_end = terminal_arm_tail
        .find("\n            Ok(None) =>")
        .expect("terminal-status arm must remain bounded before the running-process arm");
    let terminal_arm = &terminal_arm_tail[..terminal_arm_end];

    assert!(
        terminal_arm.contains("process.terminate()"),
        "direct-parent terminal status must clean the owned process tree before inherited stdout/stderr readers are joined"
    );
    assert!(
        terminal_arm.contains("exit_status = status;") && terminal_arm.contains("break;"),
        "tree cleanup must preserve the directly owned process exit status as product truth"
    );
    assert!(
        !runner.contains("terminate_owned_process(&mut process)"),
        "analysis cleanup must not bypass the owned-process Job/process-group lifetime owner"
    );

    let cleanup = terminal_arm
        .find("process.terminate()")
        .expect("terminal cleanup must remain in the terminal arm");
    let terminal_reader_join = runner
        .rfind("stdout_reader.join()")
        .expect("analysis success path must still join its stdout reader after process control");
    assert!(
        terminal_arm_start + cleanup < terminal_reader_join,
        "owned process-tree cleanup must happen before the analysis success path joins inherited output readers"
    );

    assert!(
        native_regression.contains("fn process_output_reaps_pipe_holding_descendant_before_reader_join()"),
        "the shared owned-process implementation must retain a cross-platform executable descendant-pipe regression"
    );
}
