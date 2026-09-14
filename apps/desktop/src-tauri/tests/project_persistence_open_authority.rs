#[path = "../src/project_persistence.rs"]
mod project_persistence;
#[path = "../src/project_root.rs"]
mod project_root;

use bandscope_desktop_core::{
    re_admit_local_audio_publication_from_project_root, sha256_hex_reader,
    ProjectSourceReferencePayload,
};
use std::io::Cursor;

fn source_reference(project_id: &str, bytes: &[u8]) -> ProjectSourceReferencePayload {
    ProjectSourceReferencePayload {
        project_id: project_id.to_string(),
        artifact_name: "source.wav".to_string(),
        extension: "wav".to_string(),
        file_size_bytes: bytes.len() as u64,
        content_sha256: sha256_hex_reader(Cursor::new(bytes))
            .expect("test fixture digest should be computable"),
    }
}

#[cfg(unix)]
#[test]
fn unix_project_opener_refuses_symlink_at_handle_acquisition() {
    use std::{
        fs,
        os::unix::fs::symlink,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-project-open-authority-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&root).expect("test directory should be created");
    let external = root.join("external.bscope");
    let selected = root.join("selected.bscope");
    fs::write(&external, br#"{\"id\":\"external\"}"#).expect("external fixture should be written");
    symlink(&external, &selected).expect("fixture symlink should be created");

    let opened = project_persistence::open_project_file(&selected);

    assert!(
        opened.is_err(),
        "Unix project handle acquisition must not follow a selected-path symlink"
    );
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn restart_adapter_reopens_the_exact_regular_app_owned_source() {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-source-open-authority-{}-{nonce}",
        std::process::id()
    ));
    let project_id = "project-1-1";
    let project_root = root.join(project_id);
    fs::create_dir_all(&project_root).expect("project root should be created");
    let source_bytes = b"RIFF-safe-reopen-fixture";
    fs::write(project_root.join("source.wav"), source_bytes)
        .expect("source fixture should be written");
    let reference = source_reference(project_id, source_bytes);

    let reopened = re_admit_local_audio_publication_from_project_root(
        &project_root,
        &reference,
        project_persistence::open_project_file,
    )
    .expect("the exact regular app-owned source should regain native identity");

    assert_eq!(reopened.source_path, project_root.join("source.wav"));
    assert_eq!(reopened.identity.project_id, project_id);
    assert_eq!(reopened.identity.content_sha256, reference.content_sha256);
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[test]
fn restart_adapter_rejects_artifact_traversal_before_opening() {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-source-open-traversal-{}-{nonce}",
        std::process::id()
    ));
    let project_id = "project-1-1";
    let project_root = root.join(project_id);
    fs::create_dir_all(&project_root).expect("project root should be created");
    let mut reference = source_reference(project_id, b"outside-project");
    reference.artifact_name = "../external.wav".to_string();

    let error = re_admit_local_audio_publication_from_project_root(
        &project_root,
        &reference,
        |_path| -> std::io::Result<std::fs::File> {
            panic!("forged durable evidence must fail before filesystem authority is requested")
        },
    )
    .expect_err("persisted artifact evidence must not create path traversal authority");

    assert_eq!(error, "Could not prepare the local project workspace.");
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(unix)]
#[test]
fn restart_adapter_refuses_a_symlink_source_artifact() {
    use std::{
        fs,
        os::unix::fs::symlink,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "bandscope-source-open-symlink-{}-{nonce}",
        std::process::id()
    ));
    let project_id = "project-1-1";
    let project_root = root.join(project_id);
    fs::create_dir_all(&project_root).expect("project root should be created");
    let external_bytes = b"outside-project";
    let external = root.join("external.wav");
    let source_path = project_root.join("source.wav");
    fs::write(&external, external_bytes).expect("external fixture should be written");
    symlink(&external, &source_path).expect("source symlink should be created");
    let reference = source_reference(project_id, external_bytes);

    let error = re_admit_local_audio_publication_from_project_root(
        &project_root,
        &reference,
        project_persistence::open_project_file,
    )
    .expect_err("app-owned source authority must not follow a symlink artifact");

    assert_eq!(error, "Could not prepare the local project workspace.");
    fs::remove_dir_all(root).expect("test directory should be removable");
}

#[cfg(any(target_os = "linux", target_os = "macos", windows))]
#[test]
fn restart_lookup_requires_an_existing_regular_project_directory() {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let base_root = std::env::temp_dir().join(format!(
        "bandscope-existing-project-root-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&base_root).expect("base root should be created");
    let project_id = "project-1-1";
    let project_root = base_root.join(project_id);
    fs::create_dir(&project_root).expect("project root should be created");

    let resolved = project_root::resolve_existing_project_root(&base_root, project_id)
        .expect("an existing regular project directory should resolve");

    assert_eq!(resolved, project_root);
    fs::remove_dir_all(base_root).expect("test directory should be removable");
}

#[test]
fn restart_lookup_does_not_create_a_missing_project_directory() {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let base_root = std::env::temp_dir().join(format!(
        "bandscope-missing-project-root-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&base_root).expect("base root should be created");
    let project_id = "project-1-1";
    let project_root = base_root.join(project_id);

    let error = project_root::resolve_existing_project_root(&base_root, project_id)
        .expect_err("restart must not provision a missing project directory");

    assert_eq!(error, "Could not prepare the local project workspace.");
    assert!(
        !project_root.exists(),
        "read-side restart lookup must remain non-provisioning"
    );
    fs::remove_dir_all(base_root).expect("test directory should be removable");
}

#[cfg(unix)]
#[test]
fn restart_lookup_refuses_a_symlink_project_directory() {
    use std::{
        fs,
        os::unix::fs::symlink,
        time::{SystemTime, UNIX_EPOCH},
    };

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let base_root = std::env::temp_dir().join(format!(
        "bandscope-linked-project-root-{}-{nonce}",
        std::process::id()
    ));
    let external_root = base_root.join("external");
    fs::create_dir_all(&external_root).expect("external root should be created");
    let project_id = "project-1-1";
    symlink(&external_root, base_root.join(project_id)).expect("fixture symlink should be created");

    let error = project_root::resolve_existing_project_root(&base_root, project_id)
        .expect_err("restart must not follow a project-directory symlink");

    assert_eq!(error, "Could not prepare the local project workspace.");
    fs::remove_dir_all(base_root).expect("test directory should be removable");
}
