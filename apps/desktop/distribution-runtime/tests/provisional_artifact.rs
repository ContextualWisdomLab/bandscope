use bandscope_distribution_runtime::admit_untrusted_raw_json;

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WINDOWS_X86_64_SIGNATURE: &str = "c2lnLXdpbi14NjQ=";
const WINDOWS_AARCH64_SIGNATURE: &str = "c2lnLXdpbi1hcm02NA==";
const DARWIN_X86_64_SIGNATURE: &str = "c2lnLW1hYy14NjQ=";
const DARWIN_AARCH64_SIGNATURE: &str = "c2lnLW1hYy1hcm02NA==";

fn updater_document() -> Vec<u8> {
    format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"{WINDOWS_X86_64_SIGNATURE}","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip"}},"windows-aarch64":{{"signature":"{WINDOWS_AARCH64_SIGNATURE}","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"{DARWIN_X86_64_SIGNATURE}","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"{DARWIN_AARCH64_SIGNATURE}","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{SOURCE_COMMIT}","minimumSupportedVersion":"0.1.3","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
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
    assert_eq!(metadata.artifact_signature(), DARWIN_AARCH64_SIGNATURE);
}
