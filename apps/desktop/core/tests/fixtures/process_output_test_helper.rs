use bandscope_desktop_core::MAX_PROCESS_OUTPUT_BYTES;
use std::{
    io::{self, Write},
    process::Command,
    thread,
    time::Duration,
};

const SPAWN_DESCENDANT_ENV: &str = "BANDSCOPE_TEST_SPAWN_PIPE_DESCENDANT";
const HOLD_PIPE_ENV: &str = "BANDSCOPE_TEST_HOLD_PIPE_DESCENDANT";

fn main() {
    if std::env::var_os(HOLD_PIPE_ENV).is_some() {
        thread::sleep(Duration::from_secs(5));
        return;
    }

    if std::env::var_os(SPAWN_DESCENDANT_ENV).is_some() {
        let helper = std::env::current_exe().expect("process-output helper path should resolve");
        Command::new(helper)
            .env_remove(SPAWN_DESCENDANT_ENV)
            .env(HOLD_PIPE_ENV, "1")
            .spawn()
            .expect("pipe-holding descendant should start");
        return;
    }

    let payload = vec![b'x'; MAX_PROCESS_OUTPUT_BYTES];

    let mut stdout = io::stdout().lock();
    stdout
        .write_all(&payload)
        .expect("stdout should accept the exact process-output limit");
    stdout.flush().expect("stdout should flush the test payload");

    let mut stderr = io::stderr().lock();
    stderr
        .write_all(&payload)
        .expect("stderr should accept the exact process-output limit");
    stderr.flush().expect("stderr should flush the test payload");
}
