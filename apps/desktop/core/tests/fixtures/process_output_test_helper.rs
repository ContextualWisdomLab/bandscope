use bandscope_desktop_core::MAX_PROCESS_OUTPUT_BYTES;
use std::io::{self, Write};

fn main() {
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
