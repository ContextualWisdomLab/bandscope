use bandscope_desktop_core::{wait_for_process_output, MAX_PROCESS_OUTPUT_BYTES};
use std::{process::Command, time::Duration};

#[test]
fn process_output_drains_exact_limit_stdout_and_stderr_before_exit() {
    let helper = env!("CARGO_BIN_EXE_bandscope-process-output-test-helper");
    let command = Command::new(helper);

    let output = wait_for_process_output(
        command,
        Duration::from_secs(2),
        Duration::from_millis(5),
        "Process-output helper timed out.",
    )
    .expect("exact-limit stdout and stderr should drain without deadlock or overflow");

    assert!(output.status.success());
    assert_eq!(output.stdout.len(), MAX_PROCESS_OUTPUT_BYTES);
    assert_eq!(output.stderr.len(), MAX_PROCESS_OUTPUT_BYTES);
    assert!(output.stdout.iter().all(|byte| *byte == b'x'));
    assert!(output.stderr.iter().all(|byte| *byte == b'x'));
}
