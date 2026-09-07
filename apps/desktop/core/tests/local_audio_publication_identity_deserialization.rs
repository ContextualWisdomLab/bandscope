use bandscope_desktop_core::LocalAudioPublicationIdentity;
use serde_json::{json, Value};

const CANONICAL_SHA256: &str =
    "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";

fn valid_identity_json() -> Value {
    json!({
        "projectId": "project-1-1",
        "artifactName": "source.wav",
        "extension": "wav",
        "fileSizeBytes": 4,
        "contentSha256": CANONICAL_SHA256,
    })
}

#[test]
fn publication_identity_deserialization_reuses_canonical_validation() {
    let identity: LocalAudioPublicationIdentity = serde_json::from_value(valid_identity_json())
        .expect("canonical native publication identity should deserialize");

    assert_eq!(identity.project_id, "project-1-1");
    assert_eq!(identity.artifact_name, "source.wav");
    assert_eq!(identity.extension, "wav");
    assert_eq!(identity.file_size_bytes, 4);
    assert_eq!(identity.content_sha256, CANONICAL_SHA256);
}

#[test]
fn publication_identity_deserialization_rejects_invalid_field_classes() {
    let mut invalid_id = valid_identity_json();
    invalid_id["projectId"] = json!("../project-1-1");

    let mut uppercase_extension = valid_identity_json();
    uppercase_extension["extension"] = json!("WAV");

    let mut unsupported_extension = valid_identity_json();
    unsupported_extension["extension"] = json!("exe");

    let mut zero_size = valid_identity_json();
    zero_size["fileSizeBytes"] = json!(0);

    let mut oversized = valid_identity_json();
    oversized["fileSizeBytes"] = json!(100 * 1024 * 1024_u64 + 1);

    let mut uppercase_digest = valid_identity_json();
    uppercase_digest["contentSha256"] = json!(CANONICAL_SHA256.to_uppercase());

    let mut malformed_digest = valid_identity_json();
    malformed_digest["contentSha256"] = json!("not-a-sha256");

    let mut mismatched_artifact = valid_identity_json();
    mismatched_artifact["artifactName"] = json!("source.mp3");

    for candidate in [
        invalid_id,
        uppercase_extension,
        unsupported_extension,
        zero_size,
        oversized,
        uppercase_digest,
        malformed_digest,
        mismatched_artifact,
    ] {
        let error = serde_json::from_value::<LocalAudioPublicationIdentity>(candidate)
            .expect_err("unvalidated publication identity must fail closed");
        assert!(error.to_string().contains("Could not prepare the local project workspace."));
    }
}
