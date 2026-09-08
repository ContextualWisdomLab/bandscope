#[test]
fn process_output_has_one_canonical_implementation_owner() {
    let compatibility_source = include_str!("../src/lib.rs");
    let process_output_source = include_str!("../src/process_output.rs");

    assert!(
        !compatibility_source.contains("pub fn wait_for_process_output("),
        "the compatibility module must not retain a second public process-output implementation"
    );
    assert_eq!(
        process_output_source
            .matches("pub fn wait_for_process_output(")
            .count(),
        1,
        "bounded helper execution must have one canonical implementation owner"
    );
}

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

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[test]
fn youtube_output_is_bounded_before_metadata_parse() {
    use bandscope_desktop_core::wait_for_process_output;
    use std::{
        process::Command,
        time::{Duration, Instant},
    };

    let mut command = Command::new("sh");
    command
        .arg("-c")
        .arg("dd if=/dev/zero bs=1048576 count=2 2>/dev/null");

    let started = Instant::now();
    let result = wait_for_process_output(
        command,
        Duration::from_secs(5),
        Duration::from_millis(5),
        "YouTube import timed out.",
    );
    let elapsed = started.elapsed();

    assert_eq!(
        result.expect_err("oversized subprocess output must fail closed"),
        "Failed to execute YouTube import process."
    );
    assert!(
        elapsed < Duration::from_secs(2),
        "output admission must not retain an unbounded pipe until the product timeout; elapsed={elapsed:?}"
    );
}
