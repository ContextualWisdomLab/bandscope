use std::io::Cursor;

use bandscope_desktop_core::{
    prepare_project_migration, sha256_hex_reader, SelectedPlaybackSourcePayload,
    CURRENT_PROJECT_FORMAT_VERSION,
};
use serde_json::{json, Value};

#[test]
fn golden_v2_fixture_preserves_the_selected_playback_source() {
    let content = include_str!("../testdata/project-v2.json");
    let prepared = prepare_project_migration(content)
        .expect("the checked-in v2 fixture should prepare a validated migration copy");
    let document = &prepared.document;
    let receipt = &prepared.receipt;

    assert_eq!(
        document.preferences.selected_playback_source,
        SelectedPlaybackSourcePayload::Vocals
    );
    assert_eq!(receipt.source_format_version, Some(2));
    assert_eq!(receipt.target_format_version, CURRENT_PROJECT_FORMAT_VERSION);
    assert!(receipt.migrated);
    assert_eq!(
        receipt.input_sha256,
        sha256_hex_reader(Cursor::new(content.as_bytes()))
            .expect("fixture input digest should be reproducible")
    );

    assert_eq!(
        receipt.output_sha256,
        sha256_hex_reader(Cursor::new(prepared.canonical_content.as_bytes()))
            .expect("migrated output digest should be reproducible")
    );

    let current = prepare_project_migration(&prepared.canonical_content)
        .expect("canonical migrated output should reopen through the current parser");
    assert_eq!(current.receipt.source_format_version, Some(3));
    assert!(!current.receipt.migrated);
    assert_eq!(current.receipt.input_sha256, receipt.output_sha256);
    assert_eq!(current.receipt.output_sha256, receipt.output_sha256);
    assert_eq!(current.canonical_content, prepared.canonical_content);

    let value: Value = serde_json::from_str(&prepared.canonical_content)
        .expect("the serialized v2 fixture should remain valid JSON");
    assert_eq!(
        value["projectFormatVersion"],
        json!(CURRENT_PROJECT_FORMAT_VERSION)
    );
    assert_eq!(
        value["preferences"]["selectedPlaybackSource"],
        json!("vocals")
    );
}
