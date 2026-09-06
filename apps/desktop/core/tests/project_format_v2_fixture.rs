use bandscope_desktop_core::{
    project_content_for_document, project_document_from_content, SelectedPlaybackSourcePayload,
    CURRENT_PROJECT_FORMAT_VERSION,
};
use serde_json::{json, Value};

#[test]
fn golden_v2_fixture_preserves_the_selected_playback_source() {
    let document = project_document_from_content(include_str!("../testdata/project-v2.json"))
        .expect("the checked-in v2 fixture should load");

    assert_eq!(
        document.preferences.selected_playback_source,
        SelectedPlaybackSourcePayload::Vocals
    );

    let serialized = project_content_for_document(&document)
        .expect("the checked-in v2 fixture should serialize");
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
