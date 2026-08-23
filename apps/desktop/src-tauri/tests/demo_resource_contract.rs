use std::path::PathBuf;

use serde_json::Value;

#[test]
fn bundled_demo_is_mapped_to_runtime_demo_directory() {
    let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let config: Value = serde_json::from_str(
        &std::fs::read_to_string(config_path).expect("Tauri config should be readable"),
    )
    .expect("Tauri config should contain valid JSON");

    let destination = config
        .pointer("/bundle/resources")
        .and_then(Value::as_object)
        .and_then(|resources| resources.get("resources/demo/*"))
        .and_then(Value::as_str);

    assert_eq!(destination, Some("demo/"));
}
