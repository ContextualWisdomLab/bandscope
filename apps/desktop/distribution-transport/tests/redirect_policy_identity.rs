use bandscope_distribution_runtime::admit_untrusted_raw_json;
use bandscope_distribution_transport::{
    ReleaseTransportPolicy, ResponseDecision, TransportPolicyError,
};

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SOURCE_COMMIT: &str = "1111111111111111111111111111111111111111";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INITIAL_URL: &str = "https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip";
const CDN_URL: &str = "https://release-assets.githubusercontent.com/github-production-release-asset/1178322014/update.zip?sp=r&sv=2021-08-06&sr=b";

fn policy(source_commit: &str, minimum_supported_version: &str) -> ReleaseTransportPolicy {
    let document = format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"c2ln","url":"{INITIAL_URL}"}},"windows-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{source_commit}","minimumSupportedVersion":"{minimum_supported_version}","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
    );
    let metadata = admit_untrusted_raw_json(document.as_bytes(), "windows-x86_64")
        .expect("fixture must satisfy provisional metadata admission");
    ReleaseTransportPolicy::from_provisional(&metadata).expect("transport projection")
}

fn redirect_from(policy: &ReleaseTransportPolicy) -> bandscope_distribution_transport::AdmittedRedirect {
    match policy
        .admit_initial_response(302, INITIAL_URL, Some(CDN_URL))
        .expect("originating policy admits one redirect")
    {
        ResponseDecision::FollowRedirect(redirect) => redirect,
        ResponseDecision::Download(_) => panic!("302 must require a redirect follow-up"),
    }
}

#[test]
fn redirect_decision_rejects_different_source_commit_with_same_artifact_evidence() {
    let originating_policy = policy(SOURCE_COMMIT, "0.1.3");
    let different_policy = policy(OTHER_SOURCE_COMMIT, "0.1.3");
    let redirect = redirect_from(&originating_policy);

    assert_eq!(
        different_policy.admit_redirect_response(&redirect, 200, CDN_URL),
        Err(TransportPolicyError::RedirectPolicyMismatch)
    );
}

#[test]
fn redirect_decision_rejects_different_minimum_supported_version() {
    let originating_policy = policy(SOURCE_COMMIT, "0.1.3");
    let different_policy = policy(SOURCE_COMMIT, "0.1.2");
    let redirect = redirect_from(&originating_policy);

    assert_eq!(
        different_policy.admit_redirect_response(&redirect, 200, CDN_URL),
        Err(TransportPolicyError::RedirectPolicyMismatch)
    );
}
