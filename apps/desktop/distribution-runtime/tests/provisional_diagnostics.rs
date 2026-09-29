use bandscope_distribution_runtime::admit_untrusted_raw_json;

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INITIAL_URL: &str = "https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip";
const SIGNATURE: &str = "c2lnbmF0dXJlLXJlbW90ZS1kaWFnbm9zdGljLW1hcmtlcg==";

fn updater_document() -> Vec<u8> {
    format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"{SIGNATURE}","url":"{INITIAL_URL}"}},"windows-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{SOURCE_COMMIT}","minimumSupportedVersion":"0.1.3","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
    )
    .into_bytes()
}

#[test]
fn provisional_metadata_debug_redacts_remote_signature() {
    let metadata = admit_untrusted_raw_json(&updater_document(), "windows-x86_64")
        .expect("fixture must satisfy provisional metadata admission");

    let diagnostic = format!("{metadata:?}");
    assert!(diagnostic.contains("<redacted-signature>"));
    assert!(!diagnostic.contains(SIGNATURE));
    assert_eq!(metadata.artifact_signature(), SIGNATURE);
}
