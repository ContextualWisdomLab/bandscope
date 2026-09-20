#![cfg(feature = "score-storage-fault-injection")]

use bandscope_desktop_core::inventory_published_score_pdf_receipts;
use std::{
    path::{Path, PathBuf},
    process::{Child, Command},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const CHILD_MODE_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_CHILD";
const ROOT_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_ROOT";
const SOURCE_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_SOURCE";
const SCORE_ID_ENV: &str = "BANDSCOPE_SCORE_STORAGE_EXECUTABLE_FAULT_SCORE_ID";
const CHECKPOINT_ENV: &str = "BANDSCOPE_SCORE_STORAGE_FAULT_CHECKPOINT";
const MARKER_ENV: &str = "BANDSCOPE_SCORE_STORAGE_FAULT_MARKER";
const AFTER_STAGE_SYNC_BEFORE_LINK: &str = "after-stage-sync-before-link";
const AFTER_LINK_BEFORE_STAGE_RETIREMENT: &str = "after-link-before-stage-retirement";
const BEFORE_METADATA_BARRIER: &str = "before-metadata-barrier";
const EXPECTED: &[u8] = b"%PDF-1.7\ndesktop package executable termination fixture";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
}

fn fixture(name: &str) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let base = unique_test_dir(name);
    let scores_root = base.join("scores");
    let source = base.join("selected.pdf");
    let marker = base.join("desktop-package-publisher-checkpoint-ready");
    std::fs::create_dir_all(&scores_root).expect("score root should be created");
    std::fs::write(&source, EXPECTED).expect("score fixture should be written");
    (base, scores_root, source, marker)
}

fn package_fault_harness() -> &'static str {
    env!("CARGO_BIN_EXE_score-storage-fault-harness")
}

fn spawn_desktop_package_publisher(
    checkpoint: &str,
    scores_root: &Path,
    source: &Path,
    score_id: &str,
    marker: &Path,
) -> Child {
    Command::new(package_fault_harness())
        .env(CHILD_MODE_ENV, "1")
        .env(ROOT_ENV, scores_root)
        .env(SOURCE_ENV, source)
        .env(SCORE_ID_ENV, score_id)
        .env(CHECKPOINT_ENV, checkpoint)
        .env(MARKER_ENV, marker)
        .spawn()
        .expect("desktop-package publisher child should start")
}

fn wait_for_checkpoint(child: &mut Child, marker: &Path, checkpoint: &str) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while !marker.exists() && Instant::now() < deadline {
        if let Some(status) = child
            .try_wait()
            .expect("desktop-package publisher child status should be observable")
        {
            panic!("desktop-package publisher child exited before {checkpoint}: {status}");
        }
        thread::sleep(Duration::from_millis(20));
    }
    if !marker.exists() {
        let _ = child.kill();
        let _ = child.wait();
        panic!("desktop-package publisher child did not expose {checkpoint}");
    }
    assert_eq!(
        std::fs::read_to_string(marker).expect("checkpoint marker should be readable"),
        checkpoint,
        "the desktop-package child must expose the requested publication boundary"
    );
}

fn terminate_and_reap(child: &mut Child) {
    child
        .kill()
        .expect("desktop-package publisher child should terminate at the requested boundary");
    let status = child.wait().expect("desktop-package publisher child should be reaped");
    assert!(
        !status.success(),
        "the desktop-package publisher must end by process termination, not successful return"
    );
}

fn assert_live_lease(scores_root: &Path) {
    assert!(
        inventory_published_score_pdf_receipts(scores_root).is_err(),
        "the running desktop-package executable must still own the Score Storage lease"
    );
}

#[test]
fn desktop_package_executable_termination_after_stage_sync_recovers_stage_only() {
    let score_id = "21b419e4-f604-4c04-b57e-8c589751a101";
    let (base, scores_root, source, marker) = fixture("desktop-package-stage-sync-termination");
    let mut child = spawn_desktop_package_publisher(
        AFTER_STAGE_SYNC_BEFORE_LINK,
        &scores_root,
        &source,
        score_id,
        &marker,
    );
    wait_for_checkpoint(&mut child, &marker, AFTER_STAGE_SYNC_BEFORE_LINK);

    let stage = scores_root.join(format!(".score-{score_id}.stage"));
    let destination = scores_root.join(format!("{score_id}.pdf"));
    assert!(stage.exists(), "the synchronized stage must exist before publication");
    assert!(!destination.exists(), "destination truth must not exist before the link");
    assert_eq!(std::fs::read(&stage).expect("stage should be readable"), EXPECTED);
    assert_live_lease(&scores_root);

    terminate_and_reap(&mut child);

    let receipts = inventory_published_score_pdf_receipts(&scores_root)
        .expect("restart recovery should retire the abandoned stage-only state");
    assert!(receipts.is_empty());
    assert!(!stage.exists(), "restart recovery should retire the abandoned stage");
    assert!(!destination.exists(), "restart recovery must not invent destination truth");
    let _ = std::fs::remove_dir_all(base);
}

#[test]
fn desktop_package_executable_termination_after_link_recovers_equal_aliases() {
    let score_id = "21b419e4-f604-4c04-b57e-8c589751a102";
    let (base, scores_root, source, marker) = fixture("desktop-package-post-link-termination");
    let mut child = spawn_desktop_package_publisher(
        AFTER_LINK_BEFORE_STAGE_RETIREMENT,
        &scores_root,
        &source,
        score_id,
        &marker,
    );
    wait_for_checkpoint(&mut child, &marker, AFTER_LINK_BEFORE_STAGE_RETIREMENT);

    let stage = scores_root.join(format!(".score-{score_id}.stage"));
    let destination = scores_root.join(format!("{score_id}.pdf"));
    assert!(stage.exists(), "the temporary alias must exist after link creation");
    assert!(destination.exists(), "the destination must exist after publication link creation");
    assert_eq!(std::fs::read(&stage).expect("stage should be readable"), EXPECTED);
    assert_eq!(std::fs::read(&destination).expect("destination should be readable"), EXPECTED);
    assert_live_lease(&scores_root);

    terminate_and_reap(&mut child);

    let receipts = inventory_published_score_pdf_receipts(&scores_root)
        .expect("restart recovery should retain destination truth and retire the equal stage alias");
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].score_id(), score_id);
    assert!(!stage.exists(), "restart recovery should retire only the temporary alias");
    assert_eq!(std::fs::read(&destination).expect("destination should survive"), EXPECTED);
    let _ = std::fs::remove_dir_all(base);
}

#[test]
fn desktop_package_executable_termination_before_metadata_barrier_is_recoverable() {
    let score_id = "21b419e4-f604-4c04-b57e-8c589751a103";
    let (base, scores_root, source, marker) = fixture("desktop-package-pre-barrier-termination");
    let mut child = spawn_desktop_package_publisher(
        BEFORE_METADATA_BARRIER,
        &scores_root,
        &source,
        score_id,
        &marker,
    );
    wait_for_checkpoint(&mut child, &marker, BEFORE_METADATA_BARRIER);

    let stage = scores_root.join(format!(".score-{score_id}.stage"));
    let destination = scores_root.join(format!("{score_id}.pdf"));
    assert!(!stage.exists(), "the lower publisher must retire the stage before the metadata barrier");
    assert!(destination.exists(), "the destination must already be published before the barrier");
    assert_eq!(std::fs::read(&destination).expect("destination should be readable"), EXPECTED);
    assert_live_lease(&scores_root);

    terminate_and_reap(&mut child);

    let receipts = inventory_published_score_pdf_receipts(&scores_root)
        .expect("restart recovery should retain the published object after desktop-package termination");
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].score_id(), score_id);
    assert!(!stage.exists(), "restart recovery must not recreate a retired stage alias");
    assert_eq!(std::fs::read(&destination).expect("destination should survive recovery"), EXPECTED);
    let _ = std::fs::remove_dir_all(base);
}
