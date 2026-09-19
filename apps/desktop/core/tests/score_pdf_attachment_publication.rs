use bandscope_desktop_core::publish_score_pdf_attachment;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
}

#[test]
fn score_attachment_publication_writes_complete_pdf_without_leaking_stage() {
    let root = unique_test_dir("score-attachment-publish");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    let expected = b"%PDF-1.7\nrehearsal score";
    std::fs::write(&source, expected).expect("score fixture should be written");

    let bytes = publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect("validated score should publish");

    assert_eq!(bytes, expected.len() as u64);
    assert_eq!(
        std::fs::read(root.join(format!("{SCORE_ID}.pdf")))
            .expect("published score should be readable"),
        expected
    );
    assert!(!root.join(format!(".score-{SCORE_ID}.stage")).exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn score_attachment_publication_never_clobbers_existing_score_id() {
    let root = unique_test_dir("score-attachment-noclobber");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    std::fs::write(&source, b"%PDF-1.7\nnew bytes").expect("score fixture should be written");
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    std::fs::write(&destination, b"%PDF-1.7\nexisting bytes")
        .expect("existing attachment should be written");

    let error = publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect_err("publication must not replace an existing attachment");

    assert_eq!(error, "Could not attach the score PDF.");
    assert_eq!(
        std::fs::read(&destination).expect("existing attachment should remain readable"),
        b"%PDF-1.7\nexisting bytes"
    );
    assert!(!root.join(format!(".score-{SCORE_ID}.stage")).exists());
    let _ = std::fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn score_attachment_publication_is_private_under_permissive_umask() {
    use std::os::unix::fs::MetadataExt;
    use std::process::Command;

    if std::env::var_os("BANDSCOPE_SCORE_UMASK_CHILD").is_some() {
        let root = PathBuf::from(
            std::env::var_os("BANDSCOPE_SCORE_UMASK_ROOT")
                .expect("child score root should be supplied"),
        );
        std::fs::create_dir_all(&root).expect("score root should be created");
        let source = root.join("selected.pdf");
        std::fs::write(&source, b"%PDF-1.7\nprivate score")
            .expect("score fixture should be written");
        publish_score_pdf_attachment(&source, &root, SCORE_ID)
            .expect("score publication should succeed under permissive umask");
        let mode = std::fs::metadata(root.join(format!("{SCORE_ID}.pdf")))
            .expect("published score metadata should be readable")
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
        return;
    }

    let root = unique_test_dir("score-attachment-umask");
    let test_binary = std::env::current_exe().expect("test binary should resolve");
    let status = Command::new("sh")
        .arg("-c")
        .arg("umask 000; exec \"$1\" --exact score_attachment_publication_is_private_under_permissive_umask --nocapture")
        .arg("bandscope-score-umask")
        .arg(&test_binary)
        .env("BANDSCOPE_SCORE_UMASK_CHILD", "1")
        .env("BANDSCOPE_SCORE_UMASK_ROOT", &root)
        .status()
        .expect("umask child should run");

    assert!(status.success(), "umask child regression should pass");
    let _ = std::fs::remove_dir_all(root);
}
