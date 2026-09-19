use bandscope_desktop_core::publish_score_pdf_attachment;
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const ABANDONED_SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const NEXT_SCORE_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const CHILD_ENV: &str = "BANDSCOPE_SCORE_INTERRUPTION_CHILD";
const ROOT_ENV: &str = "BANDSCOPE_SCORE_INTERRUPTION_ROOT";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
}

fn create_private_abandoned_stage(path: &Path) {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options.open(path).expect("abandoned stage should be created");
    file.write_all(b"%PDF-1.7\ninterrupted score bytes")
        .expect("abandoned score bytes should be written");
    file.sync_all()
        .expect("abandoned score bytes should reach the filesystem boundary");
}

#[test]
fn process_killed_score_stage_is_recovered_before_next_publication() {
    if std::env::var_os(CHILD_ENV).is_some() {
        let root = PathBuf::from(
            std::env::var_os(ROOT_ENV).expect("child score root should be supplied"),
        );
        std::fs::create_dir_all(&root).expect("score root should be created");
        let stage = root.join(format!(".score-{ABANDONED_SCORE_ID}.stage"));
        create_private_abandoned_stage(&stage);
        std::fs::write(root.join("child-ready"), b"ready")
            .expect("child readiness marker should be written");

        loop {
            thread::sleep(Duration::from_secs(60));
        }
    }

    let root = unique_test_dir("score-interruption-recovery");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    let expected = b"%PDF-1.7\nreplacement rehearsal score";
    std::fs::write(&source, expected).expect("replacement score fixture should be written");

    let test_binary = std::env::current_exe().expect("test binary should resolve");
    let mut child = Command::new(test_binary)
        .arg("--exact")
        .arg("process_killed_score_stage_is_recovered_before_next_publication")
        .arg("--nocapture")
        .env(CHILD_ENV, "1")
        .env(ROOT_ENV, &root)
        .spawn()
        .expect("interruption child should start");

    let marker = root.join("child-ready");
    let deadline = Instant::now() + Duration::from_secs(10);
    while !marker.exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(marker.exists(), "child should expose the staged-bytes boundary");
    assert!(
        root.join(format!(".score-{ABANDONED_SCORE_ID}.stage"))
            .exists(),
        "child should leave a synchronized stage before process termination"
    );

    child.kill().expect("interruption child should be terminated");
    let status = child.wait().expect("interruption child should be reaped");
    assert!(
        !status.success(),
        "the child must end by process termination rather than normal cleanup"
    );

    let written = publish_score_pdf_attachment(&source, &root, NEXT_SCORE_ID)
        .expect("the next score publication should recover abandoned staging first");
    assert_eq!(written, expected.len() as u64);
    assert_eq!(
        std::fs::read(root.join(format!("{NEXT_SCORE_ID}.pdf")))
            .expect("replacement score should be readable"),
        expected
    );

    let remaining_stages: Vec<_> = std::fs::read_dir(&root)
        .expect("score root should be readable")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with(".score-") && name.ends_with(".stage"))
        .collect();
    assert!(
        remaining_stages.is_empty(),
        "recovery must remove process-abandoned score staging before returning new attachment authority"
    );

    let _ = std::fs::remove_dir_all(root);
}
