#[test]
fn analysis_process_streams_share_bounded_output_admission() {
    let source = include_str!("../src/main.rs");
    let core_output = include_str!("../../core/src/process_output.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis process runner must remain present");
    let runner_tail = &source[runner_start..];
    let runner_end = runner_tail
        .find("\n}\n\n#[tauri::command]\nfn start_analysis_job")
        .expect("analysis process runner boundary must remain inspectable");
    let runner = &runner_tail[..runner_end];

    assert!(
        core_output.contains("pub fn read_bounded_process_output"),
        "raw helper output admission must remain owned by desktop core"
    );
    assert!(
        core_output.contains("pub fn read_bounded_process_lines"),
        "streaming line admission must remain owned by desktop core"
    );
    assert!(
        runner.contains("read_bounded_process_lines(stdout"),
        "analysis stdout must use the shared bounded streaming owner before JSONL status parsing"
    );
    assert!(
        runner.contains("read_bounded_process_output(stderr"),
        "analysis stderr must use the shared bounded byte owner instead of an unbounded Vec"
    );
    assert!(
        runner.contains("reader_failure_rx.recv_timeout"),
        "analysis stream admission failure must wake the single process-control owner"
    );
    assert!(
        !runner.contains("reader.read_to_end(&mut buffer)"),
        "analysis runner must not retain unbounded stderr before terminal publication"
    );
}
