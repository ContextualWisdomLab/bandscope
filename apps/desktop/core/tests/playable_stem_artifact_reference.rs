//! Contract tests for path-free playable-stem artifact references.

#[path = "../src/playable_stem_contract.rs"]
mod playable_stem_contract;

use playable_stem_contract::{
    PlayableStemArtifactSetReference, PlaybackStemKind, PLAYABLE_STEM_ARTIFACT_VERSION,
};
use std::path::Path;

const ARTIFACT_SET_ID: &str =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONTENT_HASH: &str =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn valid_reference_json() -> String {
    format!(
        r#"{{
          "artifactSetId": "{ARTIFACT_SET_ID}",
          "formatVersion": 1,
          "sampleRate": 8000,
          "channelCount": 1,
          "sampleCount": 64,
          "durationSeconds": 0.008,
          "appliedGain": 1.0,
          "stemArtifacts": [
            {{
              "artifactId": "stem-vocals",
              "stemKind": "vocals",
              "fileSizeBytes": 172,
              "contentHashSha256": "{CONTENT_HASH}",
              "mediaType": "audio/wav",
              "sampleRate": 8000,
              "channelCount": 1,
              "sampleCount": 64,
              "durationSeconds": 0.008
            }},
            {{
              "artifactId": "stem-bass",
              "stemKind": "bass",
              "fileSizeBytes": 172,
              "contentHashSha256": "{CONTENT_HASH}",
              "mediaType": "audio/wav",
              "sampleRate": 8000,
              "channelCount": 1,
              "sampleCount": 64,
              "durationSeconds": 0.008
            }},
            {{
              "artifactId": "stem-drums",
              "stemKind": "drums",
              "fileSizeBytes": 172,
              "contentHashSha256": "{CONTENT_HASH}",
              "mediaType": "audio/wav",
              "sampleRate": 8000,
              "channelCount": 1,
              "sampleCount": 64,
              "durationSeconds": 0.008
            }},
            {{
              "artifactId": "stem-other",
              "stemKind": "other",
              "fileSizeBytes": 172,
              "contentHashSha256": "{CONTENT_HASH}",
              "mediaType": "audio/wav",
              "sampleRate": 8000,
              "channelCount": 1,
              "sampleCount": 64,
              "durationSeconds": 0.008
            }}
          ]
        }}"#
    )
}

#[test]
fn parses_complete_path_free_reference() {
    let reference: PlayableStemArtifactSetReference =
        serde_json::from_str(&valid_reference_json()).expect("valid reference should parse");

    assert_eq!(reference.artifact_set_id(), ARTIFACT_SET_ID);
    assert_eq!(reference.format_version(), PLAYABLE_STEM_ARTIFACT_VERSION);
    assert_eq!(reference.sample_rate(), 8000);
    assert_eq!(reference.channel_count(), 1);
    assert_eq!(reference.sample_count(), 64);
    assert_eq!(reference.duration_seconds(), 0.008);
    assert_eq!(reference.applied_gain(), 1.0);
    assert_eq!(
        reference
            .stem_artifacts()
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
    assert_eq!(
        reference.artifact_relative_path(Path::new("/app/temp"), PlaybackStemKind::Bass),
        Path::new("/app/temp")
            .join("playable-stems-v1")
            .join(ARTIFACT_SET_ID)
            .join("bass.wav")
    );
}

#[test]
fn serialized_reference_never_contains_a_native_path() {
    let reference: PlayableStemArtifactSetReference =
        serde_json::from_str(&valid_reference_json()).expect("valid reference should parse");
    let serialized = serde_json::to_string(&reference).expect("reference should serialize");

    assert!(!serialized.to_ascii_lowercase().contains("path"));
    assert!(!serialized.contains("/app/temp"));
    let reparsed: PlayableStemArtifactSetReference =
        serde_json::from_str(&serialized).expect("serialized reference should parse");
    assert_eq!(reparsed, reference);
}

#[test]
fn rejects_unknown_path_and_storage_fields() {
    for extra_field in [
        r#", "nativeFilePath": "/secret/audio.wav""#,
        r#", "artifactRoot": "/secret""#,
        r#", "sourcePath": "C:\\secret\\audio.wav""#,
    ] {
        let malformed = valid_reference_json().replacen(
            r#""artifactId": "stem-vocals""#,
            &format!(r#""artifactId": "stem-vocals"{extra_field}"#),
            1,
        );
        assert!(serde_json::from_str::<PlayableStemArtifactSetReference>(&malformed).is_err());
    }
}

#[test]
fn rejects_invalid_set_and_artifact_identifiers() {
    for malformed in [
        valid_reference_json().replace(ARTIFACT_SET_ID, "A"),
        valid_reference_json().replace(ARTIFACT_SET_ID, "a/../../b"),
        valid_reference_json().replacen("stem-vocals", "stem-bass", 1),
        valid_reference_json().replacen(CONTENT_HASH, "ABC", 1),
    ] {
        assert!(serde_json::from_str::<PlayableStemArtifactSetReference>(&malformed).is_err());
    }
}

#[test]
fn rejects_missing_duplicate_reordered_or_unknown_stems() {
    let valid_json = valid_reference_json();
    let vocals_start = valid_json.find(r#"            {{
              "artifactId": "stem-vocals""#).unwrap();
    let bass_start = valid_json.find(r#"            {{
              "artifactId": "stem-bass""#).unwrap();
    let vocals_block = &valid_json[vocals_start..bass_start];

    let missing = valid_json.replacen(vocals_block, "", 1);
    let duplicate = valid_json.replacen(vocals_block, &format!("{vocals_block}{vocals_block}"), 1);
    let reordered = valid_json
        .replacen(vocals_block, "__VOCALS_BLOCK__", 1)
        .replacen(
            r#"            {{
              "artifactId": "stem-bass""#,
            &format!(r#"{vocals_block}            {{
              "artifactId": "stem-bass""#),
            1,
        )
        .replace("__VOCALS_BLOCK__", "");
    let unknown = valid_json.replacen("\"stemKind\": \"other\"", "\"stemKind\": \"guitar\"", 1);

    for malformed in [missing, duplicate, reordered, unknown] {
        assert!(serde_json::from_str::<PlayableStemArtifactSetReference>(&malformed).is_err());
    }
}

#[test]
fn rejects_set_level_media_and_alignment_mismatch() {
    for malformed in [
        valid_reference_json().replacen("\"formatVersion\": 1", "\"formatVersion\": 2", 1),
        valid_reference_json().replacen("\"sampleRate\": 8000", "\"sampleRate\": 7999", 1),
        valid_reference_json().replacen("\"channelCount\": 1", "\"channelCount\": 2", 1),
        valid_reference_json().replacen("\"sampleCount\": 64", "\"sampleCount\": 0", 1),
        valid_reference_json().replacen("\"durationSeconds\": 0.008", "\"durationSeconds\": 0.009", 1),
        valid_reference_json().replacen("\"appliedGain\": 1.0", "\"appliedGain\": 0.0", 1),
    ] {
        assert!(serde_json::from_str::<PlayableStemArtifactSetReference>(&malformed).is_err());
    }
}

#[test]
fn rejects_per_stem_metadata_mismatch() {
    for malformed in [
        valid_reference_json().replacen("\"fileSizeBytes\": 172", "\"fileSizeBytes\": 171", 1),
        valid_reference_json().replacen("\"mediaType\": \"audio/wav\"", "\"mediaType\": \"audio/mpeg\"", 1),
        valid_reference_json().replacen("\"sampleRate\": 8000", "\"sampleRate\": 16000", 2),
        valid_reference_json().replacen("\"sampleCount\": 64", "\"sampleCount\": 63", 2),
        valid_reference_json().replacen("\"durationSeconds\": 0.008", "\"durationSeconds\": 0.007", 2),
    ] {
        assert!(serde_json::from_str::<PlayableStemArtifactSetReference>(&malformed).is_err());
    }
}
