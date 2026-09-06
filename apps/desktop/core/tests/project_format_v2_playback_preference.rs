use bandscope_desktop_core::{
    project_content_for_document, project_document_from_content, project_document_from_value,
    project_payload_from_content, ProjectDocumentPayload, ProjectPreferencesPayload,
    SelectedPlaybackSourcePayload, CURRENT_PROJECT_FORMAT_VERSION,
};
use serde_json::{json, Value};

fn v1_fixture() -> &'static str {
    include_str!("../testdata/project-v1.json")
}

#[test]
fn v1_migrates_to_current_with_full_mix_as_the_explicit_default() {
    let document = project_document_from_content(v1_fixture())
        .expect("the supported v1 fixture should migrate to the current project document");
    let serialized = project_content_for_document(&document)
        .expect("the migrated project document should serialize");
    let value: Value = serde_json::from_str(&serialized)
        .expect("the current project document should remain valid JSON");

    assert_eq!(
        value["projectFormatVersion"],
        json!(CURRENT_PROJECT_FORMAT_VERSION)
    );
    assert_eq!(
        value["preferences"]["selectedPlaybackSource"],
        json!("full_mix")
    );
    assert!(value.get("sourceReference").is_none());
}

#[test]
fn v2_preserves_each_stable_playback_source_semantic_when_migrated_to_current() {
    let v1: Value = serde_json::from_str(v1_fixture()).expect("v1 fixture should parse");
    let song = v1["song"].clone();

    for selected_source in ["full_mix", "vocals", "bass", "drums", "other"] {
        let content = json!({
            "projectFormatVersion": 2,
            "song": song.clone(),
            "preferences": {
                "selectedPlaybackSource": selected_source
            }
        })
        .to_string();

        let document = project_document_from_content(&content)
            .expect("every stable playback-source semantic should load");
        let round_trip = project_content_for_document(&document)
            .expect("a valid v2 document should serialize as the current version");
        let round_trip_value: Value = serde_json::from_str(&round_trip)
            .expect("the serialized current document should remain valid JSON");
        assert_eq!(
            round_trip_value["projectFormatVersion"],
            json!(CURRENT_PROJECT_FORMAT_VERSION)
        );
        assert_eq!(
            round_trip_value["preferences"]["selectedPlaybackSource"],
            json!(selected_source)
        );
        assert!(round_trip_value.get("sourceReference").is_none());
    }
}

#[test]
fn v2_rejects_unknown_or_revocable_playback_authorities() {
    let v1: Value = serde_json::from_str(v1_fixture()).expect("v1 fixture should parse");
    let song = v1["song"].clone();

    for invalid_source in [
        "karaoke",
        "bandscope-playback://project-400-4/vocals?generation=7",
    ] {
        let content = json!({
            "projectFormatVersion": 2,
            "song": song.clone(),
            "preferences": {
                "selectedPlaybackSource": invalid_source
            }
        })
        .to_string();

        assert!(
            project_document_from_content(&content).is_err(),
            "invalid or revocable source {invalid_source} must fail closed"
        );
    }
}

#[test]
fn legacy_song_compatibility_also_migrates_to_full_mix() {
    let v1: Value = serde_json::from_str(v1_fixture()).expect("v1 fixture should parse");
    let legacy_song = v1["song"].to_string();

    let document = project_document_from_content(&legacy_song)
        .expect("legacy raw RehearsalSong JSON should remain a supported compatibility input");
    let serialized = project_content_for_document(&document)
        .expect("legacy input should serialize to the current version");
    let value: Value = serde_json::from_str(&serialized)
        .expect("the migrated project should remain valid JSON");

    assert_eq!(
        value["projectFormatVersion"],
        json!(CURRENT_PROJECT_FORMAT_VERSION)
    );
    assert_eq!(
        value["preferences"]["selectedPlaybackSource"],
        json!("full_mix")
    );
    assert!(value.get("sourceReference").is_none());

    // Existing callers that consume only the song view must remain source-compatible.
    assert!(project_payload_from_content(&legacy_song).is_ok());
}

#[test]
fn document_constructor_does_not_require_a_revocable_runtime_authority() {
    let song = project_payload_from_content(v1_fixture()).expect("v1 fixture should load");
    let document = ProjectDocumentPayload {
        song,
        preferences: ProjectPreferencesPayload {
            selected_playback_source: SelectedPlaybackSourcePayload::Drums,
        },
        source_reference: None,
    };

    let serialized = project_content_for_document(&document)
        .expect("typed project preferences should serialize without a playback URL");
    let value: Value = serde_json::from_str(&serialized).expect("current project JSON should parse");
    assert_eq!(
        value["projectFormatVersion"],
        json!(CURRENT_PROJECT_FORMAT_VERSION)
    );
    assert_eq!(
        value["preferences"]["selectedPlaybackSource"],
        json!("drums")
    );
    assert!(value.get("sourceReference").is_none());
    assert!(!serialized.contains("bandscope-playback://"));
}

#[test]
fn ipc_document_payload_accepts_only_stable_project_preferences() {
    let v1: Value = serde_json::from_str(v1_fixture()).expect("v1 fixture should parse");
    let song = v1["song"].clone();

    for selected_source in ["full_mix", "vocals", "bass", "drums", "other"] {
        let document = project_document_from_value(json!({
            "song": song.clone(),
            "preferences": {
                "selectedPlaybackSource": selected_source
            }
        }))
        .expect("the IPC document boundary should accept every stable source semantic");

        let serialized = project_content_for_document(&document)
            .expect("an admitted IPC document should serialize to the current durable envelope");
        let value: Value = serde_json::from_str(&serialized).expect("current JSON should parse");
        assert_eq!(
            value["projectFormatVersion"],
            json!(CURRENT_PROJECT_FORMAT_VERSION)
        );
        assert_eq!(
            value["preferences"]["selectedPlaybackSource"],
            json!(selected_source)
        );
    }

    for invalid_document in [
        json!({
            "song": song.clone(),
            "preferences": {
                "selectedPlaybackSource": "bandscope-playback://project-400-4/vocals?generation=7"
            }
        }),
        json!({
            "song": song.clone(),
            "preferences": {
                "selectedPlaybackSource": "karaoke"
            }
        }),
        json!({
            "song": song,
            "preferences": {
                "selectedPlaybackSource": "vocals"
            },
            "runtimeAuthority": "bandscope-playback://project-400-4/vocals?generation=7"
        }),
    ] {
        assert!(
            project_document_from_value(invalid_document).is_err(),
            "unknown or revocable IPC state must fail closed before project publication"
        );
    }
}
