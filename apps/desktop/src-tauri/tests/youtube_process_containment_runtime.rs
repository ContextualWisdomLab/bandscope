#[cfg(any(target_os = "linux", target_os = "macos"))]
#[test]
fn youtube_timeout_returns_after_terminating_descendant_pipe_holder() {
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
        "timeout cleanup must release inherited output pipes promptly; elapsed={elapsed:?}"
    );
}
