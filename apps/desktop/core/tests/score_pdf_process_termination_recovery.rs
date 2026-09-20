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
const AFTER_STAGE_SYNC_BEFORE_LINK: &str = "after-stage-sync-before-link";
const AFTER_LINK_BEFORE_STAGE_RETIREMENT: &str = "after-link-before-stage-retirement";
const BEFORE_METADATA_BARRIER: &str = "before-metadata-barrier";
const EXPECTED: &[u8] = b"%PDF-1.7\nproduction publisher termination fixture";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
}

fn child_publish_if_requested() -> bool {
    if std::env::var_os(CHILD_ENV).is_none() {
        return false;
    }
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

fn spawn_publisher_at(test_name: &str, checkpoint: &str, root: &PathBuf, source: &PathBuf, marker: &PathBuf) -> Child {
    let test_binary = std::env::current_exe().expect("integration test binary should resolve");
    Command::new(test_binary)
        .arg("--exact")
        .arg(test_name)
        .arg("--nocapture")
        .env(CHILD_ENV, "1")
        .env(ROOT_ENV, root)
        .env(SOURCE_ENV, source)
        .env(CHECKPOINT_ENV, checkpoint)
        .env(MARKER_ENV, marker)
        .spawn()
        .expect("publisher child should start")
}

fn terminate_and_reap(child: &mut Child) {
    child
        .kill()
        .expect("publisher child should be terminated at the requested boundary");
    let status = child.wait().expect("publisher child should be reaped");
    assert!(
        !status.success(),
        "the publisher child must end by process termination rather than successful return"
    );
}

fn fixture(name: &str) -> (PathBuf, PathBuf, PathBuf) {
    let root = unique_test_dir(name);
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    let marker = root.join("publisher-checkpoint-ready");
    std::fs::write(&source, EXPECTED).expect("score fixture should be written");
    (root, source, marker)
}

#[test]
fn production_publisher_process_termination_after_stage_sync_recovers_stage_only() {
    if child_publish_if_requested() {
        return;
    }
    let (root, source, marker) = fixture("score-publisher-stage-sync-termination");
    let mut child = spawn_publisher_at(
        "production_publisher_process_termination_after_stage_sync_recovers_stage_only",
        AFTER_STAGE_SYNC_BEFORE_LINK,
        &root,
        &source,
        &marker,
    );
    wait_for_checkpoint(&mut child, &marker);

    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    assert!(stage.exists(), "the synchronized stage must exist before publication");
    assert!(!destination.exists(), "destination truth must not exist before the link");
    assert_eq!(std::fs::read(&stage).expect("stage should be readable"), EXPECTED);
    assert!(
        inventory_published_score_pdf_receipts(&root).is_err(),
        "the live publisher must still hold the workspace lease"
    );

    terminate_and_reap(&mut child);

    let receipts = inventory_published_score_pdf_receipts(&root)
        .expect("restart recovery should retire the abandoned stage-only state");
    assert!(receipts.is_empty());
    assert!(!stage.exists(), "restart recovery should retire the abandoned stage");
    assert!(!destination.exists(), "restart recovery must not invent destination truth");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn production_publisher_process_termination_after_link_recovers_equal_aliases() {
    if child_publish_if_requested() {
        return;
    }
    let (root, source, marker) = fixture("score-publisher-post-link-termination");
    let mut child = spawn_publisher_at(
        "production_publisher_process_termination_after_link_recovers_equal_aliases",
        AFTER_LINK_BEFORE_STAGE_RETIREMENT,
        &root,
        &source,
        &marker,
    );
    wait_for_checkpoint(&mut child, &marker);

    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    assert!(stage.exists(), "the temporary alias must still exist at the post-link boundary");
    assert!(destination.exists(), "the destination must exist after publication link creation");
    assert_eq!(std::fs::read(&stage).expect("stage should be readable"), EXPECTED);
    assert_eq!(std::fs::read(&destination).expect("destination should be readable"), EXPECTED);
    assert!(
        inventory_published_score_pdf_receipts(&root).is_err(),
        "the live publisher must still hold the workspace lease"
    );

    terminate_and_reap(&mut child);

    let receipts = inventory_published_score_pdf_receipts(&root)
        .expect("restart recovery should retain destination truth and retire the equal stage alias");
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].score_id(), SCORE_ID);
    assert!(!stage.exists(), "restart recovery should retire only the temporary alias");
    assert_eq!(std::fs::read(&destination).expect("destination should survive"), EXPECTED);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn production_publisher_process_termination_before_metadata_barrier_is_recoverable() {
    if child_publish_if_requested() {
        return;
    }
    let (root, source, marker) = fixture("score-publisher-pre-barrier-termination");
    let mut child = spawn_publisher_at(
        "production_publisher_process_termination_before_metadata_barrier_is_recoverable",
        BEFORE_METADATA_BARRIER,
        &root,
        &source,
        &marker,
    );
    wait_for_checkpoint(&mut child, &marker);

    let stage = root.join(format!(".score-{SCORE_ID}.stage"));
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    assert!(!stage.exists(), "the lower publisher must retire the stage before the metadata barrier");
    assert!(destination.exists(), "the destination must already be published before the barrier");
    assert_eq!(std::fs::read(&destination).expect("destination should be readable"), EXPECTED);
    assert!(
        inventory_published_score_pdf_receipts(&root).is_err(),
        "the live publisher must still hold the workspace lease at the barrier checkpoint"
    );

    terminate_and_reap(&mut child);

    let receipts = inventory_published_score_pdf_receipts(&root)
        .expect("a fresh process should recover the published object after termination");
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].score_id(), SCORE_ID);
    assert!(!stage.exists(), "restart recovery must not recreate a retired stage alias");
    assert_eq!(std::fs::read(&destination).expect("destination should survive recovery"), EXPECTED);
    let _ = std::fs::remove_dir_all(root);
}
