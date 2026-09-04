//! Process-boundary tests for native-only playable-stem status metadata.

use bandscope_desktop_core::{
    analysis_process_status::parse_analysis_process_status, AnalysisJobState,
};
use serde_json::{json, Value};

const ARTIFACT_SET_ID: &str =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONTENT_HASH: &str =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROCESS_STATUS_ERROR: &str = "Analysis engine returned an invalid response.";

fn playable_stem_artifact_set() -> Value {
    json!({
        "artifactSetId": ARTIFACT_SET_ID,
        "formatVersion": 1,
        "sampleRate": 8000,
        "channelCount": 1,
        "sampleCount": 64,
        "durationSeconds": 0.008,
        "appliedGain": 1.0,
        "stemArtifacts": [
            playable_stem_artifact("vocals"),
            playable_stem_artifact("bass"),
            playable_stem_artifact("drums"),
            playable_stem_artifact("other")
        ]
    })
}

fn playable_stem_artifact(stem_kind: &str) -> Value {
    json!({
        "artifactId": format!("stem-{stem_kind}"),
        "stemKind": stem_kind,
        "fileSizeBytes": 172,
        "contentHashSha256": CONTENT_HASH,
        "mediaType": "audio/wav",
        "sampleRate": 8000,
        "channelCount": 1,
        "sampleCount": 64,
        "durationSeconds": 0.008
    })
}

fn succeeded_status() -> Value {
    json!({
        "jobId": "job-playable-stems",
        "state": "succeeded",
        "requestedAt": "2026-09-04T00:00:00Z",
        "updatedAt": "2026-09-04T00:00:01Z",
        "progressLabel": "Analysis ready",
        "progressStage": "ready",
        "progressPercent": 100,
        "cacheStatus": "stored",
        "result": {
            "id": "rights-cleared-song",
            "title": "Rights-cleared fixture",
            "sections": [],
            "exportSummary": {
                "format": "cue-sheet",
                "headline": "Check the first section.",
                "focusSections": []
            }
        }
    })
}

fn queued_status() -> Value {
    json!({
        "jobId": "job-queued",
        "state": "queued",
        "requestedAt": "2026-09-04T00:00:00Z",
        "updatedAt": "2026-09-04T00:00:00Z",
        "progressLabel": "Queued for analysis",
        "progressStage": "queued",
        "progressPercent": 0,
        "cacheStatus": "disabled"
    })
}

fn parse_status_value(
    process_status_value: Value,
) -> Result<bandscope_desktop_core::analysis_process_status::AnalysisProcessStatus, &'static str> {
    parse_analysis_process_status(
        &serde_json::to_string(&process_status_value)
            .expect("process status fixture should serialize"),
    )
}

#[test]
fn isolates_native_artifact_reference_from_renderer_status() {
    let mut process_status_value = succeeded_status();
    process_status_value
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert(
            "playableStemArtifactSet".to_string(),
            playable_stem_artifact_set(),
        );

    let process_status =
        parse_status_value(process_status_value).expect("complete process status should parse");
    assert_eq!(process_status.renderer_status().job_id, "job-playable-stems");
    assert!(matches!(
        &process_status.renderer_status().state,
        AnalysisJobState::Succeeded
    ));
    assert_eq!(
        process_status
            .playable_stem_artifact_set()
            .expect("native artifact reference should be retained")
            .artifact_set_id(),
        ARTIFACT_SET_ID
    );

    let renderer_status_json = serde_json::to_string(process_status.renderer_status())
        .expect("renderer status should serialize");
    assert!(!renderer_status_json.contains("playableStemArtifactSet"));
    assert!(!renderer_status_json.contains(CONTENT_HASH));
    assert!(!renderer_status_json.to_ascii_lowercase().contains("path"));

    let (renderer_status, playable_stem_artifact_set) = process_status.into_parts();
    assert_eq!(renderer_status.job_id, "job-playable-stems");
    assert_eq!(
        playable_stem_artifact_set
            .expect("consumed native artifact reference should remain available")
            .stem_artifacts()
            .len(),
        4
    );
}

#[test]
fn preserves_legacy_status_without_playable_stem_metadata() {
    let process_status =
        parse_status_value(queued_status()).expect("legacy queued status should parse");

    assert_eq!(process_status.renderer_status().job_id, "job-queued");
    assert!(process_status.playable_stem_artifact_set().is_none());
}

#[test]
fn rejects_native_artifact_metadata_on_nonterminal_or_failed_status() {
    let mut running_status = queued_status();
    let running_status_object = running_status
        .as_object_mut()
        .expect("status fixture must remain an object");
    running_status_object.insert("state".to_string(), json!("running"));
    running_status_object.insert("playableStemArtifactSet".to_string(), playable_stem_artifact_set());

    let mut failed_status = queued_status();
    let failed_status_object = failed_status
        .as_object_mut()
        .expect("status fixture must remain an object");
    failed_status_object.insert("state".to_string(), json!("failed"));
    failed_status_object.insert(
        "error".to_string(),
        json!({"code": "engine_unavailable", "message": "Analysis failed."}),
    );
    failed_status_object.insert("playableStemArtifactSet".to_string(), playable_stem_artifact_set());

    for invalid_status in [running_status, failed_status] {
        assert_eq!(parse_status_value(invalid_status), Err(PROCESS_STATUS_ERROR));
    }
}

#[test]
fn rejects_artifact_metadata_without_a_result_or_with_an_error() {
    let mut missing_result = succeeded_status();
    let missing_result_object = missing_result
        .as_object_mut()
        .expect("status fixture must remain an object");
    missing_result_object.remove("result");
    missing_result_object.insert(
        "playableStemArtifactSet".to_string(),
        playable_stem_artifact_set(),
    );

    let mut success_with_error = succeeded_status();
    let success_with_error_object = success_with_error
        .as_object_mut()
        .expect("status fixture must remain an object");
    success_with_error_object.insert(
        "error".to_string(),
        json!({"code": "engine_unavailable", "message": "Contradictory status."}),
    );
    success_with_error_object.insert(
        "playableStemArtifactSet".to_string(),
        playable_stem_artifact_set(),
    );

    for invalid_status in [missing_result, success_with_error] {
        assert_eq!(parse_status_value(invalid_status), Err(PROCESS_STATUS_ERROR));
    }
}

#[test]
fn rejects_null_malformed_or_path_bearing_artifact_metadata() {
    let mut null_artifact_set = succeeded_status();
    null_artifact_set
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert("playableStemArtifactSet".to_string(), Value::Null);

    let mut malformed_artifact_set = succeeded_status();
    malformed_artifact_set
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert(
            "playableStemArtifactSet".to_string(),
            json!({"artifactSetId": ARTIFACT_SET_ID}),
        );

    let mut path_bearing_artifact_set = playable_stem_artifact_set();
    path_bearing_artifact_set
        .get_mut("stemArtifacts")
        .and_then(Value::as_array_mut)
        .and_then(|stem_artifacts| stem_artifacts.first_mut())
        .and_then(Value::as_object_mut)
        .expect("stem artifact fixture must remain an object")
        .insert(
            "nativeFilePath".to_string(),
            json!("/Users/private/audio.wav"),
        );
    let mut path_bearing_status = succeeded_status();
    path_bearing_status
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert(
            "playableStemArtifactSet".to_string(),
            path_bearing_artifact_set,
        );

    for invalid_status in [
        null_artifact_set,
        malformed_artifact_set,
        path_bearing_status,
    ] {
        assert_eq!(parse_status_value(invalid_status), Err(PROCESS_STATUS_ERROR));
    }
}

#[test]
fn preserves_existing_unknown_field_and_json_shape_rejection() {
    let mut unknown_status = queued_status();
    unknown_status
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert("unexpectedField".to_string(), json!(true));

    assert_eq!(parse_status_value(unknown_status), Err(PROCESS_STATUS_ERROR));
    assert_eq!(
        parse_analysis_process_status("not-json"),
        Err(PROCESS_STATUS_ERROR)
    );
    assert_eq!(parse_analysis_process_status("[]"), Err(PROCESS_STATUS_ERROR));
}
