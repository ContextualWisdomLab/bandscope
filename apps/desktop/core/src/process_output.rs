use crate::runtime_core::{configure_owned_process, terminate_owned_process};
use std::{
    io::{BufRead, BufReader, Error, ErrorKind, Read},
    process::{Command, Output, Stdio},
    sync::mpsc,
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

/// Maximum stdout or stderr bytes retained from one BandScope-owned helper process.
pub const MAX_PROCESS_OUTPUT_BYTES: usize = 1024 * 1024;

const PROCESS_START_ERROR: &str = "Failed to start YouTube import process.";
const PROCESS_EXECUTION_ERROR: &str = "Failed to execute YouTube import process.";

/// Read one helper stream into a bounded parent-side byte buffer.
///
/// Security Notes: at most one probe byte beyond the product ceiling is read,
/// so callers can distinguish exact-limit EOF from overflow without permitting
/// an unbounded `Vec` allocation. This bounds captured bytes only; it does not
/// constrain memory allocated inside the helper process.
pub fn read_bounded_process_output(mut reader: impl Read) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new();
    reader
        .by_ref()
        .take(MAX_PROCESS_OUTPUT_BYTES as u64 + 1)
        .read_to_end(&mut output)?;
    if output.len() > MAX_PROCESS_OUTPUT_BYTES {
        return Err(Error::from(ErrorKind::InvalidData));
    }
    Ok(output)
}

/// Read newline-delimited helper output through the same bounded stream budget.
///
/// Security Notes: the `Take` adapter permits at most the 1 MiB ceiling plus one
/// probe byte to enter the parent. A single unterminated line is therefore also
/// bounded. Only the transport CR/LF terminator is removed; every other decoded
/// character, including an empty transport record, is preserved so the protocol
/// parser rather than this resource boundary remains authoritative for validity.
/// The callback sees a line only after the cumulative stream remains within
/// policy, so an overflowing probe cannot become analysis-status input.
pub fn read_bounded_process_lines(
    reader: impl Read,
    mut on_line: impl FnMut(&str),
) -> std::io::Result<()> {
    let mut reader = BufReader::new(reader).take(MAX_PROCESS_OUTPUT_BYTES as u64 + 1);
    let mut total_bytes = 0usize;
    let mut line = String::new();

    loop {
        line.clear();
        let read_bytes = reader.read_line(&mut line)?;
        if read_bytes == 0 {
            return Ok(());
        }
        total_bytes = total_bytes
            .checked_add(read_bytes)
            .ok_or_else(|| Error::from(ErrorKind::InvalidData))?;
        if total_bytes > MAX_PROCESS_OUTPUT_BYTES {
            return Err(Error::from(ErrorKind::InvalidData));
        }

        let payload = line.strip_suffix('\n').unwrap_or(&line);
        let payload = payload.strip_suffix('\r').unwrap_or(payload);
        on_line(payload);
    }
}

fn join_process_output(
    reader: JoinHandle<std::io::Result<Vec<u8>>>,
) -> Result<Vec<u8>, String> {
    reader
        .join()
        .map_err(|_| PROCESS_EXECUTION_ERROR.to_string())?
        .map_err(|_| PROCESS_EXECUTION_ERROR.to_string())
}

/// Run one BandScope-owned helper with a deadline and bounded captured output.
///
/// Security Notes: stdout and stderr are each admitted independently up to 1 MiB.
/// The reader consumes at most one probe byte beyond that ceiling and then drops
/// the pipe; oversized or unreadable output fails closed with a payload-free
/// product error and wakes the process-control owner without waiting for its next
/// ordinary poll. Poll waiting is clamped to the requested deadline, so a coarse
/// poll interval cannot silently extend helper lifetime. Process ownership and
/// descendant termination remain delegated to the shared runtime-core boundary.
/// This output ceiling limits parent-side capture memory only; it is not an
/// end-to-end RSS/VRAM or sandbox guarantee.
pub fn wait_for_process_output(
    mut command: Command,
    timeout: Duration,
    poll_interval: Duration,
    timeout_message: &str,
) -> Result<Output, String> {
    configure_owned_process(&mut command);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| PROCESS_START_ERROR.to_string())?;
    let stdout = child
        .stdout
        .take()
        .expect("stdout should be piped for BandScope-owned helper process");
    let stderr = child
        .stderr
        .take()
        .expect("stderr should be piped for BandScope-owned helper process");
    let (reader_failure_tx, reader_failure_rx) = mpsc::channel();
    let stdout_failure_tx = reader_failure_tx.clone();
    let stderr_failure_tx = reader_failure_tx.clone();
    let _reader_failure_guard = reader_failure_tx;
    let stdout_reader = thread::spawn(move || {
        let result = read_bounded_process_output(stdout);
        if result.is_err() {
            let _ = stdout_failure_tx.send(());
        }
        result
    });
    let stderr_reader = thread::spawn(move || {
        let result = read_bounded_process_output(stderr);
        if result.is_err() {
            let _ = stderr_failure_tx.send(());
        }
        result
    });
    let deadline = Instant::now() + timeout;

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Preserve the direct child's observed status as product truth while the shared
                // owner cleans any ordinary descendants before inherited pipes are joined.
                terminate_owned_process(&mut child);
                let stdout = join_process_output(stdout_reader)?;
                let stderr = join_process_output(stderr_reader)?;
                return Ok(Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) if Instant::now() >= deadline => {
                terminate_owned_process(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(timeout_message.to_string());
            }
            Ok(None) => {
                let wait_for = std::cmp::min(
                    poll_interval,
                    deadline.saturating_duration_since(Instant::now()),
                );
                if reader_failure_rx.recv_timeout(wait_for).is_ok() {
                    terminate_owned_process(&mut child);
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return Err(PROCESS_EXECUTION_ERROR.to_string());
                }
            }
            Err(_) => {
                terminate_owned_process(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(PROCESS_EXECUTION_ERROR.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Error as IoError, Write};

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _buffer: &mut [u8]) -> std::io::Result<usize> {
            Err(IoError::from(ErrorKind::Other))
        }
    }

    #[test]
    fn bounded_output_accepts_exact_limit() {
        let output = read_bounded_process_output(Cursor::new(vec![b'x'; MAX_PROCESS_OUTPUT_BYTES]))
            .expect("the exact process-output ceiling remains admissible");

        assert_eq!(output.len(), MAX_PROCESS_OUTPUT_BYTES);
    }

    #[test]
    fn bounded_output_rejects_one_byte_over_limit() {
        let error = read_bounded_process_output(Cursor::new(vec![
            b'x';
            MAX_PROCESS_OUTPUT_BYTES + 1
        ]))
        .expect_err("one byte beyond the process-output ceiling must fail closed");

        assert_eq!(error.kind(), ErrorKind::InvalidData);
    }

    #[test]
    fn bounded_output_preserves_reader_failure_as_internal_error() {
        let error = read_bounded_process_output(FailingReader)
            .expect_err("reader failure must remain an execution failure");

        assert_eq!(error.kind(), ErrorKind::Other);
    }

    #[test]
    fn bounded_lines_preserve_empty_transport_records() {
        let mut lines = Vec::new();
        read_bounded_process_lines(Cursor::new(b"first\n\n second \n"), |line| {
            lines.push(line.to_string());
        })
        .expect("small newline-delimited output should remain admissible");

        assert_eq!(lines, vec!["first", "", " second "]);
    }

    #[test]
    fn bounded_lines_preserve_non_line_ending_whitespace() {
        let mut lines = Vec::new();
        let payload = "  first  \r\n\u{00a0}second\u{00a0}\n";
        read_bounded_process_lines(Cursor::new(payload.as_bytes()), |line| {
            lines.push(line.to_string());
        })
        .expect("bounded JSONL transport must preserve payload whitespace outside line endings");

        assert_eq!(lines, vec!["  first  ", "\u{00a0}second\u{00a0}"]);
    }

    #[test]
    fn bounded_lines_accept_exact_limit() {
        let payload = vec![b'x'; MAX_PROCESS_OUTPUT_BYTES];
        let mut observed_bytes = 0usize;
        read_bounded_process_lines(Cursor::new(payload), |line| {
            observed_bytes = line.len();
        })
        .expect("the exact streaming output ceiling remains admissible");

        assert_eq!(observed_bytes, MAX_PROCESS_OUTPUT_BYTES);
    }

    #[test]
    fn bounded_lines_reject_one_byte_over_limit_before_callback() {
        let payload = vec![b'x'; MAX_PROCESS_OUTPUT_BYTES + 1];
        let mut callback_called = false;
        let error = read_bounded_process_lines(Cursor::new(payload), |_| {
            callback_called = true;
        })
        .expect_err("one streaming byte beyond the process-output ceiling must fail closed");

        assert_eq!(error.kind(), ErrorKind::InvalidData);
        assert!(!callback_called);
    }

    #[test]
    fn oversized_process_output_wakes_before_coarse_poll_interval() {
        if std::env::var_os("BANDSCOPE_TEST_CHILD_OVERSIZED_OUTPUT").is_some() {
            std::thread::sleep(Duration::from_millis(100));
            let oversized_output = vec![b'x'; MAX_PROCESS_OUTPUT_BYTES + 1];
            let mut stdout = std::io::stdout();
            let _ = stdout.write_all(&oversized_output);
            let _ = stdout.flush();
            std::thread::sleep(Duration::from_secs(5));
            return;
        }

        let current_test_binary = std::env::current_exe().expect("test binary should resolve");
        let mut command = Command::new(current_test_binary);
        command
            .env("BANDSCOPE_TEST_CHILD_OVERSIZED_OUTPUT", "1")
            .arg("--exact")
            .arg("process_output::tests::oversized_process_output_wakes_before_coarse_poll_interval")
            .arg("--nocapture");
        let started_at = Instant::now();

        let error = wait_for_process_output(
            command,
            Duration::from_secs(4),
            Duration::from_secs(2),
            "YouTube import timed out.",
        )
        .expect_err("known output overflow must wake the owner before the next coarse poll");

        assert_eq!(error, PROCESS_EXECUTION_ERROR);
        assert!(
            started_at.elapsed() < Duration::from_secs(1),
            "reader failure should wake process control instead of waiting for the poll interval"
        );
    }

    #[test]
    fn process_timeout_does_not_oversleep_poll_interval() {
        if std::env::var_os("BANDSCOPE_TEST_CHILD_SLOW_PROCESS").is_some() {
            std::thread::sleep(Duration::from_secs(5));
            return;
        }

        let current_test_binary = std::env::current_exe().expect("test binary should resolve");
        let mut command = Command::new(current_test_binary);
        command
            .env("BANDSCOPE_TEST_CHILD_SLOW_PROCESS", "1")
            .arg("--exact")
            .arg("process_output::tests::process_timeout_does_not_oversleep_poll_interval")
            .arg("--nocapture");
        let started_at = Instant::now();

        let error = wait_for_process_output(
            command,
            Duration::from_millis(100),
            Duration::from_secs(2),
            "YouTube import timed out.",
        )
        .expect_err("the helper deadline must not be extended by a coarse poll interval");

        assert_eq!(error, "YouTube import timed out.");
        assert!(
            started_at.elapsed() < Duration::from_secs(1),
            "the process owner must wake at the deadline rather than after the full poll interval"
        );
    }
}
