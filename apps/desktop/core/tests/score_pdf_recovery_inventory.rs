use bandscope_desktop_core::{inventory_published_score_pdf_ids, publish_score_pdf_attachment};
use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const CHILD_ENV: &str = "BANDSCOPE_SCORE_INVENTORY_CHILD";
const ROOT_ENV: &str = "BANDSCOPE_SCORE_INVENTORY_ROOT";
const SCORE_ID_A: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const SCORE_ID_B: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355f";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-score-inventory-{name}-{suffix}"))
}

fn publish_fixture(root: &PathBuf, score_id: &str, label: &str) {
    let source = root.join(format!("selected-{label}.pdf"));
    fs::write(&source, format!("%PDF-1.7\n{label}").as_bytes())
        .expect("score source fixture should be written");
    publish_score_pdf_attachment(&source, root, score_id)
        .expect("score fixture should publish through the production owner");
}

fn inventory_child() {
    let root = PathBuf::from(
        std::env::var_os(ROOT_ENV).expect("inventory child should receive score workspace"),
    );
    let ids = inventory_published_score_pdf_ids(&root)
        .expect("fresh process should inventory published Score Storage objects");
    assert_eq!(ids, vec![SCORE_ID_A.to_string(), SCORE_ID_B.to_string()]);
}

#[test]
fn published_score_inventory_survives_process_restart() {
    if std::env::var_os(CHILD_ENV).is_some() {
        inventory_child();
        return;
    }

    let root = unique_test_dir("restart");
    fs::create_dir_all(&root).expect("score workspace should be created");
    publish_fixture(&root, SCORE_ID_B, "second");
    publish_fixture(&root, SCORE_ID_A, "first");
    fs::write(root.join("notes.pdf"), b"%PDF-1.7\nunowned")
        .expect("unowned pdf fixture should be written");

    let status = Command::new(std::env::current_exe().expect("test binary path should resolve"))
        .arg("--exact")
        .arg("published_score_inventory_survives_process_restart")
        .arg("--nocapture")
        .env(CHILD_ENV, "1")
        .env(ROOT_ENV, &root)
        .status()
        .expect("inventory child should launch");
    assert!(status.success(), "fresh-process score inventory must succeed");

    fs::remove_dir_all(root).expect("restart inventory fixture should be removable");
}

#[test]
fn inventory_recovers_abandoned_stage_only_before_listing() {
    let root = unique_test_dir("stage-only");
    fs::create_dir_all(&root).expect("score workspace should be created");
    publish_fixture(&root, SCORE_ID_A, "published");
    let stage = root.join(format!(".score-{SCORE_ID_B}.stage"));
    fs::write(&stage, b"%PDF-1.7\nabandoned")
        .expect("abandoned stage fixture should be written");

    let ids = inventory_published_score_pdf_ids(&root)
        .expect("inventory should recover process-abandoned stage-only state");

    assert_eq!(ids, vec![SCORE_ID_A.to_string()]);
    assert!(!stage.exists(), "stage-only abandoned bytes should be retired before inventory");
    fs::remove_dir_all(root).expect("stage-only fixture should be removable");
}

#[test]
fn inventory_preserves_stage_plus_destination_ambiguity() {
    let root = unique_test_dir("ambiguous");
    fs::create_dir_all(&root).expect("score workspace should be created");
    let stage = root.join(format!(".score-{SCORE_ID_A}.stage"));
    let destination = root.join(format!("{SCORE_ID_A}.pdf"));
    fs::write(&stage, b"%PDF-1.7\nstage").expect("stage fixture should be written");
    fs::write(&destination, b"%PDF-1.7\ndestination")
        .expect("destination fixture should be written");

    assert!(
        inventory_published_score_pdf_ids(&root).is_err(),
        "inventory must not guess lifecycle intent when stage and destination both exist"
    );
    assert!(stage.exists());
    assert!(destination.exists());
    fs::remove_dir_all(root).expect("ambiguous fixture should be removable");
}

#[test]
fn recovery_binds_admitted_stage_identity_to_cleanup() {
    let source = include_str!("../src/score_recovery.rs");

    assert!(
        source.contains("admit_score_stage_for_cleanup(&stage)"),
        "recovery must capture the admitted stage object before later validation and cleanup"
    );
    assert!(
        source.contains("remove_admitted_score_stage(&stage, &admitted_stage)"),
        "recovery cleanup must remain bound to the stage object admitted earlier in the transaction"
    );
    assert!(
        !source.contains("remove_score_pdf_attachment(&stage)"),
        "generic pathname-time deletion may recapture a replacement object and cannot be recovery authority"
    );
}
