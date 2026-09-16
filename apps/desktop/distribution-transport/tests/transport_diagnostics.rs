use bandscope_distribution_runtime::admit_untrusted_raw_json;
use bandscope_distribution_transport::{ReleaseTransportPolicy, ResponseDecision};

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INITIAL_URL: &str = "https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip";
const CDN_URL_WITH_QUERY: &str = "https://release-assets.githubusercontent.com/github-production-release-asset/1178322014/update.zip?opaque=provider-query-value";

fn policy() -> ReleaseTransportPolicy {
    let document = format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"c2ln","url":"{INITIAL_URL}"}},"windows-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{SOURCE_COMMIT}","minimumSupportedVersion":"0.1.3","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
    );
    let metadata = admit_untrusted_raw_json(document.as_bytes(), "windows-x86_64")
        .expect("fixture must satisfy provisional metadata admission");
    ReleaseTransportPolicy::from_provisional(&metadata).expect("transport projection")
}

#[test]
fn redirect_query_and_signature_are_redacted_from_debug_surfaces() {
    let policy = policy();
    let policy_debug = format!("{policy:?}");
    assert!(policy_debug.contains("<redacted-signature>"));
    assert!(!policy_debug.contains("c2ln"));

    let redirect = match policy
        .admit_initial_response(302, INITIAL_URL, Some(CDN_URL_WITH_QUERY))
        .expect("CDN redirect with an opaque provider query should be admitted")
    {
        ResponseDecision::FollowRedirect(redirect) => redirect,
        ResponseDecision::Download(_) => panic!("302 must produce a redirect decision"),
    };

    let redirect_debug = format!("{redirect:?}");
    assert!(redirect_debug.contains("<redacted-query>"));
    assert!(!redirect_debug.contains("provider-query-value"));

    let head = policy
        .admit_redirect_response(&redirect, 200, CDN_URL_WITH_QUERY)
        .expect("admitted redirect should terminate in a download head");
    let head_debug = format!("{head:?}");
    assert!(head_debug.contains("<redacted-query>"));
    assert!(!head_debug.contains("provider-query-value"));
    assert!(head_debug.contains("<redacted-signature>"));
    assert!(!head_debug.contains("c2ln"));

    assert_eq!(redirect.location(), CDN_URL_WITH_QUERY);
    assert_eq!(head.effective_url(), CDN_URL_WITH_QUERY);
    assert_eq!(head.artifact_signature(), "c2ln");
}
