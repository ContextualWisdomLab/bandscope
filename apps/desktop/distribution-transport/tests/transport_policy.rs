use bandscope_distribution_download::DownloadAdmissionError;
use bandscope_distribution_runtime::{admit_untrusted_raw_json, MetadataError};
use bandscope_distribution_transport::{
    ReleaseTransportPolicy, ResponseDecision, TransportDownloadError, TransportPolicyError,
};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const SOURCE_COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INITIAL_URL: &str = "https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-x86_64.zip";
const CDN_URL: &str = "https://release-assets.githubusercontent.com/github-production-release-asset/1178322014/update.zip?sp=r&sv=2021-08-06&sr=b";

fn updater_document_with_signature(signature: &str) -> Vec<u8> {
    format!(
        r#"{{"version":"1.2.3","platforms":{{"windows-x86_64":{{"signature":"{signature}","url":"{INITIAL_URL}"}},"windows-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-windows-aarch64.zip"}},"darwin-x86_64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-x86_64.tar.gz"}},"darwin-aarch64":{{"signature":"c2ln","url":"https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/BandScope-darwin-aarch64.tar.gz"}}}},"bandscope":{{"schemaVersion":1,"sourceCommit":"{SOURCE_COMMIT}","minimumSupportedVersion":"0.1.3","artifacts":{{"windows-x86_64":{{"sizeBytes":4,"sha256":"{DIGEST}"}},"windows-aarch64":{{"sizeBytes":5,"sha256":"{DIGEST}"}},"darwin-x86_64":{{"sizeBytes":6,"sha256":"{DIGEST}"}},"darwin-aarch64":{{"sizeBytes":7,"sha256":"{DIGEST}"}}}}}}}}"#
    )
    .into_bytes()
}

fn updater_document() -> Vec<u8> {
    updater_document_with_signature("c2ln")
}

fn policy_with_signature(signature: &str) -> ReleaseTransportPolicy {
    let metadata = admit_untrusted_raw_json(
        &updater_document_with_signature(signature),
        "windows-x86_64",
    )
    .expect("fixture must satisfy provisional metadata admission");
    ReleaseTransportPolicy::from_provisional(&metadata).expect("transport projection")
}

fn policy() -> ReleaseTransportPolicy {
    policy_with_signature("c2ln")
}

fn scratch_dir(label: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after unix epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "bandscope-distribution-transport-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&path).expect("create isolated staging directory");
    path
}

fn staging_lease_path(directory: &Path) -> std::path::PathBuf {
    directory.join(".bandscope-staging.lock")
}

fn remove_staging_lease(directory: &Path) {
    fs::remove_file(staging_lease_path(directory)).expect("remove persistent staging lease fixture");
}

fn assert_platform_drop_cleanup(path: &Path) {
    #[cfg(unix)]
    assert!(!path.exists(), "Unix removes the descriptor-owned staging path");

    #[cfg(not(unix))]
    {
        assert!(
            path.is_file(),
            "non-Unix drop defers pathname deletion when descriptor identity cannot be proven"
        );
        fs::remove_file(path).expect("remove deferred unverified scratch fixture");
    }
}

#[test]
fn malformed_tauri_signature_envelope_is_rejected_by_metadata_owner() {
    assert_eq!(
        admit_untrusted_raw_json(
            &updater_document_with_signature("not-base64!"),
            "windows-x86_64",
        ),
        Err(MetadataError::InvalidSignature)
    );
}

#[test]
fn github_release_redirect_is_one_hop_and_streams_through_bounded_staging() {
    let policy = policy();
    let redirect = match policy
        .admit_initial_response(302, INITIAL_URL, Some(CDN_URL))
        .expect("GitHub release CDN redirect should be admitted")
    {
        ResponseDecision::FollowRedirect(redirect) => redirect,
        ResponseDecision::Download(_) => panic!("302 must not expose a response body"),
    };
    assert_eq!(redirect.location(), CDN_URL);

    let head = policy
        .admit_redirect_response(&redirect, 200, CDN_URL)
        .expect("one admitted redirect may terminate in 200");
    assert_eq!(head.expected_size_bytes(), 4);
    assert_eq!(head.expected_artifact_sha256(), DIGEST);
    assert_eq!(head.artifact_signature(), "c2ln");

    let directory = scratch_dir("redirect");
    let mut download = head
        .start_staging(&directory, Some(4), None)
        .expect("start bounded staging");
    download.admit_chunk(b"da").expect("first chunk");
    download.admit_chunk(b"ta").expect("second chunk");
    let sealed = download.finish().expect("exact response seals");
    assert_eq!(sealed.bytes_written(), 4);
    let path = sealed.path().to_path_buf();
    drop(sealed);
    assert_platform_drop_cleanup(&path);
    remove_staging_lease(&directory);
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn sealed_transport_artifact_keeps_candidate_identity_with_descriptor_evidence() {
    let policy = policy();
    let head = match policy
        .admit_initial_response(200, INITIAL_URL, None)
        .expect("direct response")
    {
        ResponseDecision::Download(head) => head,
        ResponseDecision::FollowRedirect(_) => panic!("200 must be final"),
    };
    let directory = scratch_dir("sealed-identity");
    let mut download = head
        .start_staging(&directory, Some(4), None)
        .expect("start bounded staging");
    download.admit_chunk(b"data").expect("exact artifact chunk");
    let sealed = download.finish().expect("exact response seals");

    assert_eq!(sealed.version_components(), (1, 2, 3));
    assert_eq!(sealed.source_commit(), SOURCE_COMMIT);
    assert_eq!(sealed.target(), "windows-x86_64");
    assert_eq!(sealed.minimum_supported_version_components(), (0, 1, 3));
    assert_eq!(sealed.effective_url(), INITIAL_URL);
    assert_eq!(sealed.artifact_name(), "BandScope-windows-x86_64.zip");
    assert_eq!(sealed.expected_size_bytes(), 4);
    assert_eq!(sealed.expected_artifact_sha256(), DIGEST);
    assert_eq!(sealed.artifact_signature(), "c2ln");
    assert_eq!(sealed.bytes_written(), 4);

    let path = sealed.path().to_path_buf();
    drop(sealed);
    assert_platform_drop_cleanup(&path);
    remove_staging_lease(&directory);
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn redirect_decision_cannot_cross_provisional_policy_identity() {
    let originating_policy = policy_with_signature("c2ln");
    let different_policy = policy_with_signature("c2lnMQ==");
    let redirect = match originating_policy
        .admit_initial_response(302, INITIAL_URL, Some(CDN_URL))
        .expect("originating policy admits one redirect")
    {
        ResponseDecision::FollowRedirect(redirect) => redirect,
        ResponseDecision::Download(_) => panic!("302 must require a redirect follow-up"),
    };

    assert_eq!(
        different_policy.admit_redirect_response(&redirect, 200, CDN_URL),
        Err(TransportPolicyError::RedirectPolicyMismatch)
    );
}

#[test]
fn hostile_redirects_and_redirect_chaining_fail_closed() {
    let policy = policy();
    assert_eq!(
        policy.admit_initial_response(302, INITIAL_URL, Some("https://evil.example/update.zip")),
        Err(TransportPolicyError::InvalidRedirectLocation)
    );

    let redirect = match policy
        .admit_initial_response(302, INITIAL_URL, Some(CDN_URL))
        .expect("canonical release CDN redirect")
    {
        ResponseDecision::FollowRedirect(redirect) => redirect,
        ResponseDecision::Download(_) => panic!("302 must require a redirect follow-up"),
    };
    assert_eq!(
        policy.admit_redirect_response(&redirect, 302, CDN_URL),
        Err(TransportPolicyError::RedirectChainingRejected)
    );
    assert_eq!(
        policy.admit_redirect_response(&redirect, 200, "https://evil.example/update.zip"),
        Err(TransportPolicyError::RedirectEffectiveUrlDrift)
    );
}

#[test]
fn content_length_mismatch_fails_before_staging_file_creation() {
    let policy = policy();
    let head = match policy
        .admit_initial_response(200, INITIAL_URL, None)
        .expect("direct response")
    {
        ResponseDecision::Download(head) => head,
        ResponseDecision::FollowRedirect(_) => panic!("200 must be final"),
    };
    let directory = scratch_dir("length");
    assert_eq!(
        head.start_staging(&directory, Some(3), None).unwrap_err(),
        TransportDownloadError::Download(DownloadAdmissionError::ContentLengthMismatch)
    );
    assert_eq!(fs::read_dir(&directory).expect("read staging directory").count(), 0);
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn encoded_response_body_is_rejected_before_staging_file_creation() {
    let policy = policy();
    let head = match policy
        .admit_initial_response(200, INITIAL_URL, None)
        .expect("direct response")
    {
        ResponseDecision::Download(head) => head,
        ResponseDecision::FollowRedirect(_) => panic!("200 must be final"),
    };
    let directory = scratch_dir("content-encoding");
    assert_eq!(
        head.start_staging(&directory, Some(4), Some("gzip")).unwrap_err(),
        TransportDownloadError::UnsupportedContentEncoding
    );
    assert_eq!(fs::read_dir(&directory).expect("read staging directory").count(), 0);
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn explicit_identity_content_encoding_remains_admitted() {
    let policy = policy();
    let head = match policy
        .admit_initial_response(200, INITIAL_URL, None)
        .expect("direct response")
    {
        ResponseDecision::Download(head) => head,
        ResponseDecision::FollowRedirect(_) => panic!("200 must be final"),
    };
    let directory = scratch_dir("identity-encoding");
    let mut download = head
        .start_staging(&directory, Some(4), Some("identity"))
        .expect("identity encoding preserves exact artifact bytes");
    download.admit_chunk(b"data").expect("exact artifact chunk");
    let sealed = download.finish().expect("exact response seals");
    let path = sealed.path().to_path_buf();
    drop(sealed);
    assert_platform_drop_cleanup(&path);
    remove_staging_lease(&directory);
    fs::remove_dir(directory).expect("remove staging directory");
}

#[test]
fn cancelled_transport_releases_lease_and_preserves_platform_cleanup_contract() {
    let policy = policy();
    let head = match policy
        .admit_initial_response(200, INITIAL_URL, None)
        .expect("direct response")
    {
        ResponseDecision::Download(head) => head,
        ResponseDecision::FollowRedirect(_) => panic!("200 must be final"),
    };
    let directory = scratch_dir("cancel");
    let mut download = head
        .start_staging(&directory, None, None)
        .expect("start bounded staging");
    download.admit_chunk(b"da").expect("partial chunk");
    let path = download.path().to_path_buf();
    assert!(path.is_file());
    assert!(staging_lease_path(&directory).is_file());

    drop(download);
    assert_platform_drop_cleanup(&path);
    assert!(staging_lease_path(&directory).is_file());
    remove_staging_lease(&directory);
    fs::remove_dir(directory).expect("remove staging directory");
}
