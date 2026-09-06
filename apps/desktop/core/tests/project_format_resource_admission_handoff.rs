use bandscope_desktop_core::{
    build_local_audio_publication_identity, project_source_reference_from_publication_identity,
    LocalAudioCopyReceipt, LocalAudioPublicationIdentity,
};

const CONTENT_SHA256: &str =
    "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";

fn verified_identity() -> LocalAudioPublicationIdentity {
    build_local_audio_publication_identity(
        "project-400-4",
        "flac",
        &LocalAudioCopyReceipt {
            file_size_bytes: 8192,
            content_sha256: CONTENT_SHA256.to_string(),
        },
    )
    .expect("Resource Admission fixture should be valid")
}

#[test]
fn projects_verified_native_publication_identity_into_path_free_persistence_evidence() {
    let identity = verified_identity();
    let reference = project_source_reference_from_publication_identity(&identity)
        .expect("verified native identity should cross the persistence ACL");

    assert_eq!(reference.project_id, "project-400-4");
    assert_eq!(reference.artifact_name, "source.flac");
    assert_eq!(reference.extension, "flac");
    assert_eq!(reference.file_size_bytes, 8192);
    assert_eq!(reference.content_sha256, CONTENT_SHA256);

    let serialized = serde_json::to_value(reference).expect("source reference should serialize");
    let keys = serialized
        .as_object()
        .expect("source reference should serialize as an object")
        .keys()
        .map(String::as_str)
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        keys,
        std::collections::BTreeSet::from([
            "artifactName",
            "contentSha256",
            "extension",
            "fileSizeBytes",
            "projectId",
        ])
    );
}

#[test]
fn rejects_forged_identity_at_the_resource_admission_to_persistence_acl() {
    let mut forged = verified_identity();
    forged.artifact_name = "../source.flac".to_string();

    assert!(project_source_reference_from_publication_identity(&forged).is_err());
}
