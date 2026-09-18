use std::io::Cursor;

use bandscope_desktop_core::{
    project_content_for_document, project_document_with_migration_receipt, sha256_hex_reader,
    SelectedPlaybackSourcePayload, CURRENT_PROJECT_FORMAT_VERSION,
};
use serde_json::{json, Value};

#[test]
fn golden_v2_fixture_preserves_the_selected_playback_source() {
    let content = include_str!("../testdata/project-v2.json");
    let (document, receipt) = project_document_with_migration_receipt(content)
        .expect("the checked-in v2 fixture should load with migration evidence");

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

    let serialized = project_content_for_document(&document)
        .expect("the checked-in v2 fixture should serialize");
    assert_eq!(
        receipt.output_sha256,
        sha256_hex_reader(Cursor::new(serialized.as_bytes()))
            .expect("migrated output digest should be reproducible")
    );

    let value: Value = serde_json::from_str(&serialized)
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
