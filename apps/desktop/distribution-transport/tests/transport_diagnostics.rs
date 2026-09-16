use bandscope_distribution_runtime::admit_untrusted_raw_json;
use bandscope_distribution_transport::{ReleaseTransportPolicy, ResponseDecision};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

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

fn scratch_dir(label: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after unix epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "bandscope-distribution-transport-diagnostics-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&path).expect("create isolated diagnostics staging directory");
    path
}

fn remove_sealed_fixture(path: &Path) {
    #[cfg(unix)]
    assert!(!path.exists(), "Unix removes the descriptor-owned staging path");

    #[cfg(not(unix))]
    if path.is_file() {
        fs::remove_file(path).expect("remove deferred sealed diagnostics fixture");
    }
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

#[test]
fn sealed_transport_debug_keeps_candidate_and_provider_evidence_out_of_logs() {
    let policy = policy();
    let redirect = match policy
        .admit_initial_response(302, INITIAL_URL, Some(CDN_URL_WITH_QUERY))
        .expect("admit one release-asset redirect")
    {
        ResponseDecision::FollowRedirect(redirect) => redirect,
        ResponseDecision::Download(_) => panic!("302 must produce a redirect decision"),
    };
    let head = policy
        .admit_redirect_response(&redirect, 200, CDN_URL_WITH_QUERY)
        .expect("redirect should terminate in an admitted body");
    let directory = scratch_dir("sealed-redaction");
    let mut download = head
        .start_staging(&directory, Some(4), None)
        .expect("start exact bounded staging");
    download.admit_chunk(b"data").expect("write exact fixture bytes");
    let sealed = download.finish().expect("seal exact fixture bytes");

    let sealed_debug = format!("{sealed:?}");
    assert!(sealed_debug.contains("<redacted-query>"));
    assert!(sealed_debug.contains("<redacted-signature>"));
    assert!(!sealed_debug.contains("provider-query-value"));
    assert!(!sealed_debug.contains("c2ln"));
    assert!(!sealed_debug.contains(SOURCE_COMMIT));
    assert!(!sealed_debug.contains(DIGEST));

    let path = sealed.path().to_path_buf();
    drop(sealed);
    remove_sealed_fixture(&path);
    let lease = directory.join(".bandscope-staging.lock");
    if lease.is_file() {
        fs::remove_file(lease).expect("remove diagnostics staging lease fixture");
    }
    fs::remove_dir(directory).expect("remove diagnostics staging directory");
}
