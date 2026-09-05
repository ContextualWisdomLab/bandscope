//! Contract tests for path-free playable-stem artifact references.

use bandscope_desktop_core::playable_stem_contract::{
    PlayableStemArtifactSetReference, PlaybackStemKind,
    MAX_CLASSIC_RIFF_PCM16_SAMPLE_COUNT, PLAYABLE_STEM_ARTIFACT_VERSION,
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

fn set_sample_geometry(reference_value: &mut Value, sample_count: u64) {
    let sample_rate = 8_000_u64;
    let duration_seconds = sample_count as f64 / sample_rate as f64;
    let file_size_bytes = 44_u64 + (sample_count * 2_u64);
    reference_object_mut(reference_value)
        .insert("sampleCount".to_string(), json!(sample_count));
    reference_object_mut(reference_value)
        .insert("durationSeconds".to_string(), json!(duration_seconds));
    for stem_artifact in stem_artifacts_mut(reference_value) {
        let stem_artifact_object = stem_artifact
            .as_object_mut()
            .expect("stem artifact fixture must remain an object");
        stem_artifact_object.insert("sampleCount".to_string(), json!(sample_count));
        stem_artifact_object.insert("durationSeconds".to_string(), json!(duration_seconds));
        stem_artifact_object.insert("fileSizeBytes".to_string(), json!(file_size_bytes));
    }
}

#[test]
fn parses_complete_path_free_reference_and_exposes_metadata() {
    let artifact_reference =
        parse_reference(valid_reference_value()).expect("valid reference should parse");

    assert_eq!(artifact_reference.artifact_set_id(), ARTIFACT_SET_ID);
    assert_eq!(
        artifact_reference.format_version(),
        PLAYABLE_STEM_ARTIFACT_VERSION
    );
    assert_eq!(artifact_reference.sample_rate(), 8000);
    assert_eq!(artifact_reference.channel_count(), 1);
    assert_eq!(artifact_reference.sample_count(), 64);
    assert_eq!(artifact_reference.duration_seconds(), 0.008);
    assert_eq!(artifact_reference.applied_gain(), 1.0);

    let stem_artifacts = artifact_reference.stem_artifacts();
    assert_eq!(
        stem_artifacts
            .iter()
            .map(|stem_artifact| stem_artifact.stem_kind())
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

    for (stem_kind, file_name) in [
        (PlaybackStemKind::Vocals, "vocals.wav"),
        (PlaybackStemKind::Bass, "bass.wav"),
        (PlaybackStemKind::Drums, "drums.wav"),
        (PlaybackStemKind::Other, "other.wav"),
    ] {
        assert_eq!(
            artifact_reference.derive_artifact_path(Path::new("/app/temp"), stem_kind),
            Path::new("/app/temp")
                .join("playable-stems-v1")
                .join(ARTIFACT_SET_ID)
                .join(file_name)
        );
    }
}

#[test]
fn serialized_reference_never_contains_a_native_path() {
    let artifact_reference =
        parse_reference(valid_reference_value()).expect("valid reference should parse");
    let serialized_reference =
        serde_json::to_string(&artifact_reference).expect("reference should serialize");

    assert!(!serialized_reference.to_ascii_lowercase().contains("path"));
    assert!(!serialized_reference.contains("/app/temp"));
    let reparsed_reference: PlayableStemArtifactSetReference =
        serde_json::from_str(&serialized_reference).expect("serialized reference should parse");
    assert_eq!(reparsed_reference, artifact_reference);
}

#[test]
fn rejects_unknown_path_and_storage_fields() {
    for (field_name, field_value) in [
        ("nativeFilePath", "/secret/audio.wav"),
        ("artifactRoot", "/secret"),
        ("sourcePath", "C:\\secret\\audio.wav"),
    ] {
        let mut malformed_reference = valid_reference_value();
        stem_artifact_object_mut(&mut malformed_reference, 0)
            .insert(field_name.to_string(), json!(field_value));
        assert!(parse_reference(malformed_reference).is_err());
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

    for malformed_reference in [
        malformed_set_case,
        malformed_set_path,
        malformed_artifact_id,
        malformed_hash_case,
        malformed_hash_length,
    ] {
        assert!(parse_reference(malformed_reference).is_err());
    }
}

#[test]
fn rejects_missing_duplicate_reordered_or_unknown_stems() {
    let mut missing_reference = valid_reference_value();
    stem_artifacts_mut(&mut missing_reference).remove(0);

    let mut duplicate_reference = valid_reference_value();
    let duplicate_artifact = stem_artifacts_mut(&mut duplicate_reference)[0].clone();
    stem_artifacts_mut(&mut duplicate_reference).push(duplicate_artifact);

    let mut reordered_reference = valid_reference_value();
    stem_artifacts_mut(&mut reordered_reference).swap(0, 1);

    let mut unknown_reference = valid_reference_value();
    stem_artifact_object_mut(&mut unknown_reference, 3)
        .insert("stemKind".to_string(), json!("guitar"));

    for malformed_reference in [
        missing_reference,
        duplicate_reference,
        reordered_reference,
        unknown_reference,
    ] {
        assert!(parse_reference(malformed_reference).is_err());
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

    let mut stereo_reference = valid_reference_value();
    reference_object_mut(&mut stereo_reference)
        .insert("channelCount".to_string(), json!(2));

    let mut empty_reference = valid_reference_value();
    reference_object_mut(&mut empty_reference)
        .insert("sampleCount".to_string(), json!(0));

    let mut duration_mismatch = valid_reference_value();
    reference_object_mut(&mut duration_mismatch)
        .insert("durationSeconds".to_string(), json!(0.009));

    let mut zero_gain = valid_reference_value();
    reference_object_mut(&mut zero_gain).insert("appliedGain".to_string(), json!(0.0));

    let mut excessive_gain = valid_reference_value();
    reference_object_mut(&mut excessive_gain)
        .insert("appliedGain".to_string(), json!(1.1));

    for malformed_reference in [
        unsupported_version,
        low_sample_rate,
        high_sample_rate,
        stereo_reference,
        empty_reference,
        duration_mismatch,
        zero_gain,
        excessive_gain,
    ] {
        assert!(parse_reference(malformed_reference).is_err());
    }
}

#[test]
fn enforces_classic_riff_sample_count_boundary() {
    let mut maximum_reference = valid_reference_value();
    set_sample_geometry(
        &mut maximum_reference,
        MAX_CLASSIC_RIFF_PCM16_SAMPLE_COUNT,
    );
    let parsed_maximum =
        parse_reference(maximum_reference).expect("classic RIFF maximum should parse");
    assert_eq!(
        parsed_maximum.sample_count(),
        MAX_CLASSIC_RIFF_PCM16_SAMPLE_COUNT
    );
    assert_eq!(
        parsed_maximum.stem_artifacts()[0].file_size_bytes(),
        4_294_967_302
    );

    let mut excessive_reference = valid_reference_value();
    set_sample_geometry(
        &mut excessive_reference,
        MAX_CLASSIC_RIFF_PCM16_SAMPLE_COUNT + 1,
    );
    assert!(parse_reference(excessive_reference).is_err());
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

    for malformed_reference in [
        size_mismatch,
        media_type_mismatch,
        sample_rate_mismatch,
        channel_count_mismatch,
        sample_count_mismatch,
        duration_mismatch,
    ] {
        assert!(parse_reference(malformed_reference).is_err());
    }
}
