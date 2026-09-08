#[cfg(any(target_os = "linux", target_os = "macos"))]
#[test]
fn youtube_timeout_terminates_descendant_that_keeps_output_pipe_open() {
    use bandscope_desktop_core::wait_for_process_output;
    use std::{
        process::Command,
        time::{Duration, Instant},
    };

    let mut command = Command::new("sh");
    command.arg("-c").arg("sleep 5 & sleep 5");

    let started = Instant::now();
    let result = wait_for_process_output(
        command,
        Duration::from_millis(50),
        Duration::from_millis(5),
        "YouTube import timed out.",
    );
    let elapsed = started.elapsed();

    assert_eq!(
        result.expect_err("the import process should hit the product timeout"),
        "YouTube import timed out."
    );
    assert!(
        elapsed < Duration::from_secs(1),
        "timeout cleanup must terminate descendants that retain inherited stdout/stderr; elapsed={elapsed:?}"
    );
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[test]
fn youtube_success_terminates_descendant_that_keeps_output_pipe_open() {
    use bandscope_desktop_core::wait_for_process_output;
    use std::{
        process::Command,
        time::{Duration, Instant},
    };

    let mut command = Command::new("sh");
    command.arg("-c").arg("sleep 5 & exit 0");

    let started = Instant::now();
    let output = wait_for_process_output(
        command,
        Duration::from_secs(2),
        Duration::from_millis(5),
        "YouTube import timed out.",
    )
    .expect("the directly owned process should exit successfully");
    let elapsed = started.elapsed();

    assert!(output.status.success());
    assert!(
        elapsed < Duration::from_secs(1),
        "successful parent exit must not block on an inherited descendant pipe; elapsed={elapsed:?}"
    );
}
