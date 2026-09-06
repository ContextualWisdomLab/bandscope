use bandscope_desktop_core::project_document_from_value;
use serde_json::{json, Value};

const CONTENT_SHA256: &str =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn v2_song() -> Value {
    let fixture: Value = serde_json::from_str(include_str!("../testdata/project-v2.json"))
        .expect("the checked-in v2 fixture should remain valid JSON");
    fixture["song"].clone()
}

#[test]
fn renderer_cannot_author_source_reference_before_native_handoff() {
    let payload = json!({
        "song": v2_song(),
        "preferences": { "selectedPlaybackSource": "full_mix" },
        "sourceReference": {
            "projectId": "project-400-4",
            "artifactName": "source.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
            "contentSha256": CONTENT_SHA256
        }
    });

    let error = project_document_from_value(payload)
        .expect_err("renderer JSON must not author native filesystem identity or digest evidence");

    assert_eq!(error, "Invalid project document payload");
}
