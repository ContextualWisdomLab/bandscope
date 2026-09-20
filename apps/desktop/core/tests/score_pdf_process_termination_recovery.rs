#![cfg(feature = "score-storage-fault-injection")]

use bandscope_desktop_core::{
    inventory_published_score_pdf_receipts, publish_score_pdf_attachment,
};
use std::{
    path::PathBuf,
    process::{Child, Command},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const SCORE_ID: &str = "0f3b6ce0-43c8-4c64-a8ec-cf905a8bd0d1";
const CHILD_ENV: &str = "BANDSCOPE_SCORE_PUBLISHER_TERMINATION_CHILD";
const ROOT_ENV: &str = "BANDSCOPE_SCORE_PUBLISHER_TERMINATION_ROOT";
const SOURCE_ENV: &str = "BANDSCOPE_SCORE_PUBLISHER_TERMINATION_SOURCE";
const CHECKPOINT_ENV: &str = "BANDSCOPE_SCORE_STORAGE_FAULT_CHECKPOINT";
const MARKER_ENV: &str = "BANDSCOPE_SCORE_STORAGE_FAULT_MARKER";
const BEFORE_METADATA_BARRIER: &str = "before-metadata-barrier";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
}

fn wait_for_checkpoint(child: &mut Child, marker: &PathBuf) {
    let deadline = Instant::now() + Duration::from_secs(15);
    while !marker.exists() && Instant::now() < deadline {
        if let Some(status) = child
            .try_wait()
            .expect("publisher child status should be observable")
        {
            panic!("publisher child exited before the requested checkpoint: {status}");
        }
        thread::sleep(Duration::from_millis(20));
    }
    if !marker.exists() {
        let _ = child.kill();
        let _ = child.wait();
        panic!("publisher child did not expose the requested checkpoint");
    }
}

#[test]
fn production_publisher_process_termination_before_metadata_barrier_is_recoverable() {
    if std::env::var_os(CHILD_ENV).is_some() {
        let root = PathBuf::from(
            std::env::var_os(ROOT_ENV).expect("publisher child root should be supplied"),
        );
        let source = PathBuf::from(
            std::env::var_os(SOURCE_ENV).expect("publisher child source should be supplied"),
        );
        publish_score_pdf_attachment(&source, &root, SCORE_ID)
            .expect("publisher child should reach the injected checkpoint before returning");
        panic!("publisher child unexpectedly returned instead of waiting at the checkpoint");
    }

    let root = unique_test_dir("score-publisher-process-termination");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    let marker = root.join("publisher-checkpoint-ready");
    let expected = b"%PDF-1.7\nproduction publisher termination fixture";
    std::fs::write(&source, expected).expect("score fixture should be written");

    let test_binary = std::env::current_exe().expect("integration test binary should resolve");
    let mut child = Command::new(test_binary)
        .arg("--exact")
        .arg("production_publisher_process_termination_before_metadata_barrier_is_recoverable")
        .arg("--nocapture")
        .env(CHILD_ENV, "1")
        .env(ROOT_ENV, &root)
        .env(SOURCE_ENV, &source)
        .env(CHECKPOINT_ENV, BEFORE_METADATA_BARRIER)
        .env(MARKER_ENV, &marker)
        .spawn()
        .expect("publisher child should start");

    wait_for_checkpoint(&mut child, &marker);

    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    assert!(
        !stage.exists(),
        "the lower publisher must retire the temporary alias before the metadata barrier"
    );
    assert!(
        destination.exists(),
        "the destination must already be published before the metadata barrier"
    );
    assert_eq!(
        std::fs::read(&destination).expect("published destination should remain readable"),
        expected
    );
    assert!(
        inventory_published_score_pdf_receipts(&root).is_err(),
        "the live publisher must still hold the Score Storage workspace lease at the checkpoint"
    );

    child
        .kill()
        .expect("publisher child should be terminated at the durability boundary");
    let status = child.wait().expect("publisher child should be reaped");
    assert!(
        !status.success(),
        "the publisher child must end by process termination rather than successful return"
    );

    let receipts = inventory_published_score_pdf_receipts(&root)
        .expect("a fresh process should recover the published object after termination");
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].score_id(), SCORE_ID);
    assert!(
        !stage.exists(),
        "restart recovery must not recreate a retired staging alias"
    );
    assert_eq!(
        std::fs::read(&destination).expect("published destination should survive recovery"),
        expected
    );

    let _ = std::fs::remove_dir_all(root);
}
