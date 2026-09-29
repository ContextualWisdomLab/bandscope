use bandscope_distribution_runtime::{
    admit_untrusted_raw_json, MetadataError, MAX_SIGNATURE_BYTES,
};

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn updater_document(nonselected_signature: &str) -> Vec<u8> {
    format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip"}},"windows-aarch64":{{"signature":"{nonselected_signature}","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{SOURCE_COMMIT}","minimumSupportedVersion":"0.1.3","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
    )
    .into_bytes()
}

#[test]
fn malformed_nonselected_signature_fails_at_metadata_owner() {
    assert_eq!(
        admit_untrusted_raw_json(&updater_document("not-base64!"), "windows-x86_64"),
        Err(MetadataError::InvalidSignature)
    );
}

#[test]
fn canonical_padding_variants_are_admitted_for_nonselected_targets() {
    for signature in ["c2ln", "c2k=", "c2lnMQ=="] {
        assert!(
            admit_untrusted_raw_json(&updater_document(signature), "windows-x86_64").is_ok(),
            "canonical signature envelope should be admitted: {signature}"
        );
    }
}

#[test]
fn malformed_padding_and_nonzero_pad_bits_fail_closed() {
    for signature in ["c2ln=", "=2ln", "YR==", "YWJ="] {
        assert_eq!(
            admit_untrusted_raw_json(&updater_document(signature), "windows-x86_64"),
            Err(MetadataError::InvalidSignature),
            "noncanonical signature envelope must fail: {signature}"
        );
    }
}

#[test]
fn empty_and_oversized_signature_envelopes_fail_closed() {
    assert_eq!(
        admit_untrusted_raw_json(&updater_document(""), "windows-x86_64"),
        Err(MetadataError::InvalidSignature)
    );

    let oversized = "A".repeat(MAX_SIGNATURE_BYTES + 4);
    assert_eq!(
        admit_untrusted_raw_json(&updater_document(&oversized), "windows-x86_64"),
        Err(MetadataError::InvalidSignature)
    );
}
