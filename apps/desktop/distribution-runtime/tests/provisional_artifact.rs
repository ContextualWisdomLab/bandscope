use bandscope_distribution_runtime::admit_untrusted_raw_json;

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn updater_document() -> Vec<u8> {
    format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"sig-win-x64","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip"}},"windows-aarch64":{{"signature":"sig-win-arm64","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"sig-mac-x64","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"sig-mac-arm64","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{SOURCE_COMMIT}","minimumSupportedVersion":"0.1.3","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
    )
    .into_bytes()
}

#[test]
fn selected_transport_fields_remain_bound_to_strict_admission() {
    let metadata = admit_untrusted_raw_json(&updater_document(), "darwin-aarch64")
        .expect("fixture must satisfy provisional metadata admission");

    assert_eq!(metadata.artifact_size_bytes(), 7);
    assert_eq!(metadata.expected_artifact_sha256(), DIGEST);
    assert_eq!(
        metadata.artifact_url(),
        "https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"
    );
    assert_eq!(metadata.artifact_signature(), "sig-mac-arm64");
}
