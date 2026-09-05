use bandscope_desktop_core::{
    project_content_for_document, project_document_from_content, ProjectSourceReferencePayload,
    CURRENT_PROJECT_FORMAT_VERSION,
};
use serde_json::{json, Value};

fn v2_song() -> Value {
    let fixture: Value = serde_json::from_str(include_str!("../testdata/project-v2.json"))
        .expect("the checked-in v2 fixture should remain valid JSON");
    fixture["song"].clone()
}

#[test]
fn current_project_round_trips_an_app_owned_source_reference_without_a_filesystem_path() {
    let content = json!({
        "projectFormatVersion": 3,
        "song": v2_song(),
        "preferences": { "selectedPlaybackSource": "drums" },
        "sourceReference": {
            "projectId": "project-400-4",
            "artifactName": "source.wav",
            "extension": "wav",
            "fileSizeBytes": 4096
        }
    })
    .to_string();

    let document = project_document_from_content(&content)
        .expect("the current project should admit one app-owned source reference");
    assert_eq!(
        document.source_reference,
        Some(ProjectSourceReferencePayload {
            project_id: "project-400-4".to_string(),
            artifact_name: "source.wav".to_string(),
            extension: "wav".to_string(),
            file_size_bytes: 4096,
        })
    );

    let serialized = project_content_for_document(&document)
        .expect("the admitted current project should serialize");
    let value: Value = serde_json::from_str(&serialized)
        .expect("the serialized current project should remain valid JSON");
    assert_eq!(value["projectFormatVersion"], json!(CURRENT_PROJECT_FORMAT_VERSION));
    assert_eq!(value["sourceReference"]["projectId"], json!("project-400-4"));
    assert_eq!(value["sourceReference"]["artifactName"], json!("source.wav"));
    assert!(serialized.find("sourcePath").is_none());
    assert!(serialized.find("bandscope-playback://").is_none());
}

#[test]
fn v2_migrates_without_inventing_a_source_reference() {
    let document = project_document_from_content(include_str!("../testdata/project-v2.json"))
        .expect("v2 should migrate into the current document");
    assert_eq!(document.source_reference, None);

    let serialized = project_content_for_document(&document)
        .expect("migrated v2 should serialize as the current format");
    let value: Value = serde_json::from_str(&serialized)
        .expect("the migrated project should remain valid JSON");
    assert_eq!(value["projectFormatVersion"], json!(CURRENT_PROJECT_FORMAT_VERSION));
    assert!(value.get("sourceReference").is_none());
}

#[test]
fn current_project_rejects_paths_and_untrusted_source_reference_shapes() {
    for source_reference in [
        json!({
            "projectId": "../escape",
            "artifactName": "source.wav",
            "extension": "wav",
            "fileSizeBytes": 4096
        }),
        json!({
            "projectId": "project-400-4",
            "artifactName": "../source.wav",
            "extension": "wav",
            "fileSizeBytes": 4096
        }),
        json!({
            "projectId": "project-400-4",
            "artifactName": "source.mp3",
            "extension": "wav",
            "fileSizeBytes": 4096
        }),
        json!({
            "projectId": "project-400-4",
            "artifactName": "source.wav",
            "extension": "exe",
            "fileSizeBytes": 4096
        }),
        json!({
            "projectId": "project-400-4",
            "artifactName": "source.wav",
            "extension": "wav",
            "fileSizeBytes": 0
        }),
        json!({
            "projectId": "project-400-4",
            "artifactName": "source.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
            "sourcePath": "/Users/example/Music/private.wav"
        }),
    ] {
        let content = json!({
            "projectFormatVersion": 3,
            "song": v2_song(),
            "preferences": { "selectedPlaybackSource": "full_mix" },
            "sourceReference": source_reference
        })
        .to_string();

        assert!(
            project_document_from_content(&content).is_err(),
            "unsafe source reference must fail closed"
        );
    }
}

#[test]
fn current_project_rejects_a_source_reference_without_content_identity() {
    let content = json!({
        "projectFormatVersion": 3,
        "song": v2_song(),
        "preferences": { "selectedPlaybackSource": "full_mix" },
        "sourceReference": {
            "projectId": "project-400-4",
            "artifactName": "source.wav",
            "extension": "wav",
            "fileSizeBytes": 4096
        }
    })
    .to_string();

    assert!(
        project_document_from_content(&content).is_err(),
        "a durable source reference must carry content identity, not byte length alone"
    );
}
