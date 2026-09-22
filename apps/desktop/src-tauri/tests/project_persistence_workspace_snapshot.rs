//! Wiring guard for the app-owned Project Persistence snapshot.

#[test]
fn workspace_save_resolves_a_fixed_native_snapshot_without_renderer_path_input() {
    let source = include_str!("../src/main.rs");

    assert!(source.contains("workspace: Option<bool>"));
    assert!(source.contains("app_owned_root(&app, \"projects\", project_id)?"));
    assert!(source.contains("project_root.join(\"project.bscope\")"));
    assert!(source.contains("project_persistence::recover_project_publication(&path)?"));
    assert!(source.contains("project_persistence::publish_new_project_file(&path, content.as_bytes())?"));
}
