#[path = "../src/project_persistence.rs"]
mod project_persistence;

use std::{fs, io::Cursor, path::PathBuf};

fn test_dir(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "bandscope-project-revision-{name}-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&root).expect("revision fixture directory should be created");
    root
}

fn digest(content: &[u8]) -> String {
    bandscope_desktop_core::sha256_hex_reader(Cursor::new(content))
        .expect("fixture digest should be computed")
}

#[test]
fn first_workspace_publication_returns_revision_and_stale_revision_fails_closed() {
    let root = test_dir("cas");
    let target = root.join("project.bscope");
    let first = br#"{"version":1,"song":{"id":"first"}}"#;
    let second = br#"{"version":1,"song":{"id":"second"}}"#;
    let stale = br#"{"version":1,"song":{"id":"stale"}}"#;

    let first_revision = project_persistence::publish_workspace_project_file_with_expected_content(
        &target,
        first,
        None,
    )
    .expect("first workspace publication should accept an absent predecessor");
    assert_eq!(first_revision, digest(first));

    let second_revision = project_persistence::publish_workspace_project_file_with_expected_content(
        &target,
        second,
        Some(&first_revision),
    )
    .expect("current durable revision should authorize replacement");
    assert_eq!(second_revision, digest(second));

    let error = project_persistence::publish_workspace_project_file_with_expected_content(
        &target,
        stale,
        Some(&first_revision),
    )
    .expect_err("stale full-song snapshot must not overwrite the current project");
    assert_eq!(error, "Project changed since it was opened.");
    assert_eq!(fs::read(&target).expect("current project should remain readable"), second);

    fs::remove_dir_all(root).expect("revision fixture should be removed");
}

#[test]
fn workspace_revision_presence_must_match_target_presence() {
    let root = test_dir("presence");
    let target = root.join("project.bscope");
    let content = br#"{"version":1,"song":{"id":"presence"}}"#;

    let unexpected_revision = digest(content);
    let missing_error = project_persistence::publish_workspace_project_file_with_expected_content(
        &target,
        content,
        Some(&unexpected_revision),
    )
    .expect_err("a revision cannot authorize a target that does not exist");
    assert_eq!(missing_error, "Project changed since it was opened.");

    fs::write(&target, content).expect("existing project fixture should be written");
    let existing_error = project_persistence::publish_workspace_project_file_with_expected_content(
        &target,
        br#"{"version":1,"song":{"id":"replacement"}}"#,
        None,
    )
    .expect_err("an existing target requires an expected durable revision");
    assert_eq!(existing_error, "Project changed since it was opened.");
    assert_eq!(fs::read(&target).expect("existing project should remain readable"), content);

    fs::remove_dir_all(root).expect("revision fixture should be removed");
}
