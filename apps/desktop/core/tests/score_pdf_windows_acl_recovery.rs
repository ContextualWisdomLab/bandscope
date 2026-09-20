#![cfg(windows)]

use bandscope_desktop_core::inventory_published_score_pdf_receipts;
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-score-windows-acl-{name}-{suffix}"))
}

fn current_windows_identity() -> String {
    let output = Command::new("whoami")
        .output()
        .expect("whoami should be available on the supported Windows runner");
    assert!(output.status.success(), "whoami should resolve the current Windows identity");
    String::from_utf8(output.stdout)
        .expect("whoami output should be UTF-8 on the hosted runner")
        .trim()
        .to_owned()
}

fn run_icacls(path: &Path, args: &[String]) {
    let mut command = Command::new("icacls");
    command.arg(path);
    command.args(args);
    let output = command
        .output()
        .expect("icacls should be available on the supported Windows runner");
    assert!(
        output.status.success(),
        "icacls failed: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn windows_acl_denied_reserved_stage_fails_closed_and_preserves_evidence() {
    let root = unique_test_dir("reserved-stage");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    std::fs::write(&stage, b"%PDF-1.7\r\nwindows acl fault")
        .expect("reserved stage fixture should be written");

    let identity = current_windows_identity();
    run_icacls(&stage, &["/inheritance:r".to_string()]);
    run_icacls(&stage, &["/deny".to_string(), format!("{identity}:(R)")]);

    let result = inventory_published_score_pdf_receipts(&root);

    // Restore the ACL before inspecting or deleting the fixture. The assertion
    // below therefore proves recovery did not remove the reserved stage while
    // read authority was indeterminate, rather than relying on Path::exists()
    // through the deliberately denied ACL.
    run_icacls(&stage, &["/reset".to_string()]);

    assert!(result.is_err(), "Windows ACL denial must make recovery fail closed");
    assert!(stage.exists(), "ACL-denied recovery must preserve the reserved stage as evidence");

    let _ = std::fs::remove_dir_all(root);
}
