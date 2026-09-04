//! Contract tests for path-free playable-stem artifact references.

#[path = "../src/playable_stem_contract.rs"]
mod playable_stem_contract;

use playable_stem_contract::{
    PlayableStemArtifactSetReference, PlaybackStemKind, PLAYABLE_STEM_ARTIFACT_VERSION,
};
use serde_json::{json, Map, Value};
use std::path::Path;

const ARTIFACT_SET_ID: &str =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONTENT_HASH: &str =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn valid_stem_artifact(stem_kind: &str) -> Value {
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

fn valid_reference_value() -> Value {
    json!({
        "artifactSetId": ARTIFACT_SET_ID,
        "formatVersion": 1,
        "sampleRate": 8000,
        "channelCount": 1,
        "sampleCount": 64,
        "durationSeconds": 0.008,
        "appliedGain": 1.0,
        "stemArtifacts": [
            valid_stem_artifact("vocals"),
            valid_stem_artifact("bass"),
            valid_stem_artifact("drums"),
            valid_stem_artifact("other")
        ]
    })
}

fn parse_reference(
    reference_value: Value,
) -> Result<PlayableStemArtifactSetReference, serde_json::Error> {
    serde_json::from_value(reference_value)
}

fn reference_object_mut(reference_value: &mut Value) -> &mut Map<String, Value> {
    reference_value
        .as_object_mut()
        .expect("reference fixture must remain an object")
}

fn stem_artifacts_mut(reference_value: &mut Value) -> &mut Vec<Value> {
    reference_object_mut(reference_value)
        .get_mut("stemArtifacts")
        .and_then(Value::as_array_mut)
        .expect("stemArtifacts fixture must remain an array")
}

fn stem_artifact_object_mut(
    reference_value: &mut Value,
    artifact_index: usize,
) -> &mut Map<String, Value> {
    stem_artifacts_mut(reference_value)[artifact_index]
        .as_object_mut()
        .expect("stem artifact fixture must remain an object")
}

#[test]
fn parses_complete_path_free_reference_and_exposes_metadata() {
    let reference =
        parse_reference(valid_reference_value()).expect("valid reference should parse");

    assert_eq!(reference.artifact_set_id(), ARTIFACT_SET_ID);
    assert_eq!(reference.format_version(), PLAYABLE_STEM_ARTIFACT_VERSION);
    assert_eq!(reference.sample_rate(), 8000);
    assert_eq!(reference.channel_count(), 1);
    assert_eq!(reference.sample_count(), 64);
    assert_eq!(reference.duration_seconds(), 0.008);
    assert_eq!(reference.applied_gain(), 1.0);

    let stem_artifacts = reference.stem_artifacts();
    assert_eq!(
        stem_artifacts
            .iter()
            .map(|artifact| artifact.stem_kind())
            .collect::<Vec<_>>(),
        vec![
            PlaybackStemKind::Vocals,
            PlaybackStemKind::Bass,
            PlaybackStemKind::Drums,
            PlaybackStemKind::Other,
        ]
    );
    let vocal_artifact = &stem_artifacts[0];
    assert_eq!(vocal_artifact.artifact_id(), "stem-vocals");
    assert_eq!(vocal_artifact.file_size_bytes(), 172);
    assert_eq!(vocal_artifact.content_hash_sha256(), CONTENT_HASH);
    assert_eq!(vocal_artifact.media_type(), "audio/wav");
    assert_eq!(vocal_artifact.sample_rate(), 8000);
    assert_eq!(vocal_artifact.channel_count(), 1);
    assert_eq!(vocal_artifact.sample_count(), 64);
    assert_eq!(vocal_artifact.duration_seconds(), 0.008);
    assert_eq!(
        reference.derive_artifact_path(Path::new("/app/temp"), PlaybackStemKind::Bass),
        Path::new("/app/temp")
            .join("playable-stems-v1")
            .join(ARTIFACT_SET_ID)
            .join("bass.wav")
    );
}

#[test]
fn serialized_reference_never_contains_a_native_path() {
    let reference =
        parse_reference(valid_reference_value()).expect("valid reference should parse");
    let serialized = serde_json::to_string(&reference).expect("reference should serialize");

    assert!(!serialized.to_ascii_lowercase().contains("path"));
    assert!(!serialized.contains("/app/temp"));
    let reparsed: PlayableStemArtifactSetReference =
        serde_json::from_str(&serialized).expect("serialized reference should parse");
    assert_eq!(reparsed, reference);
}

#[test]
fn rejects_unknown_path_and_storage_fields() {
    for (field_name, field_value) in [
        ("nativeFilePath", "/secret/audio.wav"),
        ("artifactRoot", "/secret"),
        ("sourcePath", "C:\\secret\\audio.wav"),
    ] {
        let mut malformed = valid_reference_value();
        stem_artifact_object_mut(&mut malformed, 0)
            .insert(field_name.to_string(), json!(field_value));
        assert!(parse_reference(malformed).is_err());
    }

    let mut malformed_set = valid_reference_value();
    reference_object_mut(&mut malformed_set)
        .insert("storageRoot".to_string(), json!("/secret"));
    assert!(parse_reference(malformed_set).is_err());
}

#[test]
fn rejects_invalid_set_artifact_and_hash_identifiers() {
    let mut malformed_set_case = valid_reference_value();
    reference_object_mut(&mut malformed_set_case)
        .insert("artifactSetId".to_string(), json!("A".repeat(64)));

    let mut malformed_set_path = valid_reference_value();
    reference_object_mut(&mut malformed_set_path)
        .insert("artifactSetId".to_string(), json!("a/../../b"));

    let mut malformed_artifact_id = valid_reference_value();
    stem_artifact_object_mut(&mut malformed_artifact_id, 0)
        .insert("artifactId".to_string(), json!("stem-bass"));

    let mut malformed_hash_case = valid_reference_value();
    stem_artifact_object_mut(&mut malformed_hash_case, 0)
        .insert("contentHashSha256".to_string(), json!("B".repeat(64)));

    let mut malformed_hash_length = valid_reference_value();
    stem_artifact_object_mut(&mut malformed_hash_length, 0)
        .insert("contentHashSha256".to_string(), json!("b".repeat(63)));

    for malformed in [
        malformed_set_case,
        malformed_set_path,
        malformed_artifact_id,
        malformed_hash_case,
        malformed_hash_length,
    ] {
        assert!(parse_reference(malformed).is_err());
    }
}

#[test]
fn rejects_missing_duplicate_reordered_or_unknown_stems() {
    let mut missing = valid_reference_value();
    stem_artifacts_mut(&mut missing).remove(0);

    let mut duplicate = valid_reference_value();
    let duplicate_artifact = stem_artifacts_mut(&mut duplicate)[0].clone();
    stem_artifacts_mut(&mut duplicate).push(duplicate_artifact);

    let mut reordered = valid_reference_value();
    stem_artifacts_mut(&mut reordered).swap(0, 1);

    let mut unknown = valid_reference_value();
    stem_artifact_object_mut(&mut unknown, 3)
        .insert("stemKind".to_string(), json!("guitar"));

    for malformed in [missing, duplicate, reordered, unknown] {
        assert!(parse_reference(malformed).is_err());
    }
}

#[test]
fn rejects_set_level_version_media_and_alignment_mismatch() {
    let mut unsupported_version = valid_reference_value();
    reference_object_mut(&mut unsupported_version)
        .insert("formatVersion".to_string(), json!(2));

    let mut low_sample_rate = valid_reference_value();
    reference_object_mut(&mut low_sample_rate)
        .insert("sampleRate".to_string(), json!(7999));

    let mut high_sample_rate = valid_reference_value();
    reference_object_mut(&mut high_sample_rate)
        .insert("sampleRate".to_string(), json!(192001));

    let mut stereo = valid_reference_value();
    reference_object_mut(&mut stereo).insert("channelCount".to_string(), json!(2));

    let mut empty = valid_reference_value();
    reference_object_mut(&mut empty).insert("sampleCount".to_string(), json!(0));

    let mut duration_mismatch = valid_reference_value();
    reference_object_mut(&mut duration_mismatch)
        .insert("durationSeconds".to_string(), json!(0.009));

    let mut zero_gain = valid_reference_value();
    reference_object_mut(&mut zero_gain).insert("appliedGain".to_string(), json!(0.0));

    let mut excessive_gain = valid_reference_value();
    reference_object_mut(&mut excessive_gain)
        .insert("appliedGain".to_string(), json!(1.1));

    for malformed in [
        unsupported_version,
        low_sample_rate,
        high_sample_rate,
        stereo,
        empty,
        duration_mismatch,
        zero_gain,
        excessive_gain,
    ] {
        assert!(parse_reference(malformed).is_err());
    }
}

#[test]
fn rejects_file_size_overflow_before_accepting_artifacts() {
    let mut malformed = valid_reference_value();
    let oversized_sample_count = u64::MAX;
    let oversized_duration = oversized_sample_count as f64 / 8000.0;
    reference_object_mut(&mut malformed)
        .insert("sampleCount".to_string(), json!(oversized_sample_count));
    reference_object_mut(&mut malformed)
        .insert("durationSeconds".to_string(), json!(oversized_duration));

    assert!(parse_reference(malformed).is_err());
}

#[test]
fn rejects_each_per_stem_metadata_mismatch() {
    let mut size_mismatch = valid_reference_value();
    stem_artifact_object_mut(&mut size_mismatch, 0)
        .insert("fileSizeBytes".to_string(), json!(171));

    let mut media_type_mismatch = valid_reference_value();
    stem_artifact_object_mut(&mut media_type_mismatch, 0)
        .insert("mediaType".to_string(), json!("audio/mpeg"));

    let mut sample_rate_mismatch = valid_reference_value();
    stem_artifact_object_mut(&mut sample_rate_mismatch, 0)
        .insert("sampleRate".to_string(), json!(16000));

    let mut channel_count_mismatch = valid_reference_value();
    stem_artifact_object_mut(&mut channel_count_mismatch, 0)
        .insert("channelCount".to_string(), json!(2));

    let mut sample_count_mismatch = valid_reference_value();
    stem_artifact_object_mut(&mut sample_count_mismatch, 0)
        .insert("sampleCount".to_string(), json!(63));

    let mut duration_mismatch = valid_reference_value();
    stem_artifact_object_mut(&mut duration_mismatch, 0)
        .insert("durationSeconds".to_string(), json!(0.007));

    for malformed in [
        size_mismatch,
        media_type_mismatch,
        sample_rate_mismatch,
        channel_count_mismatch,
        sample_count_mismatch,
        duration_mismatch,
    ] {
        assert!(parse_reference(malformed).is_err());
    }
}
