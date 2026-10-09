//! Test-only child for cancellation, bounded pipe capture, and result admission.

use bandscope_desktop_core::{BASIC_PITCH_MODEL_SHA256, MAX_PROCESS_OUTPUT_BYTES};
use serde_json::json;
use std::{
    io::{self, Read, Write},
    process::{Command, Stdio},
    thread,
    time::Duration,
};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).expect("a fixture mode is required");
    if mode == "descendant-hold" {
        thread::sleep(Duration::from_secs(10));
        return;
    }
    let mut request = String::new();
    io::stdin().take(4097).read_to_string(&mut request).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&request).unwrap(),
        json!({"sourcePath":"/native/source.wav"})
    );
    match mode.as_str() {
        "hold" => {
            if let Some(ready) = args.get(2) {
                std::fs::write(ready, "ready").unwrap();
            }
            thread::sleep(Duration::from_secs(10));
            return;
        }
        "descendant" => {
            Command::new(std::env::current_exe().unwrap())
                .arg("descendant-hold")
                .stdin(Stdio::null())
                .spawn()
                .unwrap();
        }
        "stdout-overflow" => {
            let _ = io::stdout().write_all(&vec![b'x'; MAX_PROCESS_OUTPUT_BYTES + 1]);
            thread::sleep(Duration::from_secs(10));
            return;
        }
        "stderr-overflow" => {
            let _ = io::stderr().write_all(&vec![b'x'; MAX_PROCESS_OUTPUT_BYTES + 1]);
            thread::sleep(Duration::from_secs(10));
            return;
        }
        "dual-pipe" => {
            io::stderr()
                .write_all(&vec![b'x'; MAX_PROCESS_OUTPUT_BYTES])
                .unwrap();
        }
        "error" | "unknown-error" => {
            let code = if mode == "error" {
                "audio_rejected"
            } else {
                "/private/source.wav"
            };
            eprintln!("private decoder diagnostics /private/source.wav");
            println!(
                "{}",
                json!({"schemaVersion":1,
                "error":{"code":code,"message":"private decoder diagnostics"}})
            );
            std::process::exit(1);
        }
        "invalid-json" => {
            println!("private decoder diagnostics");
            return;
        }
        "success" => {}
        _ => panic!("unknown fixture mode"),
    }
    println!(
        "{}",
        json!({"schemaVersion":1,"sourceLabel":"source.wav","durationSeconds":1.0,
        "model":{"name":"basic-pitch","version":"0.4.0","sha256":BASIC_PITCH_MODEL_SHA256},
        "notes":[],"midiBase64":"TVRoZAAAAAYAAAABAeBNVHJrAAAABAD/LwA=","warnings":[]})
    );
}
