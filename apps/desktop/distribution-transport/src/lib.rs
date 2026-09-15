//! Fail-closed transport admission between updater metadata and staged bytes.
//!
//! This Distribution-owned boundary consumes `ProvisionalUpdateMetadata`
//! directly, so transport code never reparses remote updater JSON. It admits
//! response status/effective-URL evidence and routes body chunks through
//! `bandscope-distribution-download`. It deliberately does not perform network
//! I/O, metadata authentication, artifact signature verification, installation,
//! freshness-state mutation, or project persistence.

#![forbid(unsafe_code)]

use bandscope_distribution_download::{
    ArtifactDownloadAdmission, DownloadAdmissionError, SealedArtifactFile, StagedArtifactFile,
    StagingArtifactError,
};
use bandscope_distribution_runtime::ProvisionalUpdateMetadata;
use std::path::Path;

/// Maximum redirect location accepted from one release-asset response.
pub const MAX_REDIRECT_URL_BYTES: usize = 16 * 1024;

const RELEASE_ASSET_CDN_PREFIX: &str = "https://release-assets.githubusercontent.com/";

/// Fail-closed reasons for updater transport-policy admission.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransportPolicyError {
    /// The provisional updater URL did not contain a direct artifact basename.
    InvalidAdmittedArtifactUrl,
    /// The provisional Tauri updater signature is not canonical standard base64.
    InvalidArtifactSignatureEnvelope,
    /// The HTTP stack reports an effective URL different from the admitted request URL.
    EffectiveUrlDrift,
    /// The initial response status is not an admitted direct-download or redirect status.
    UnexpectedInitialStatus(u16),
    /// A redirect response omitted or supplied an invalid Location value.
    InvalidRedirectLocation,
    /// The redirected request completed at a URL different from the admitted Location.
    RedirectEffectiveUrlDrift,
    /// A redirected release-asset request attempted another redirect.
    RedirectChainingRejected,
    /// The redirected response did not terminate in an admitted success status.
    UnexpectedRedirectStatus(u16),
}

/// Failure while converting an admitted response head into bounded staged bytes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransportDownloadError {
    /// The response declared a content coding that would transform artifact bytes.
    UnsupportedContentEncoding,
    /// Byte-count or content-length admission failed.
    Download(DownloadAdmissionError),
    /// App-owned staging-file admission or sealing failed.
    Staging(StagingArtifactError),
}

/// A one-hop release-asset redirect admitted by Distribution policy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedRedirect {
    source_url: String,
    location: String,
}

impl AdmittedRedirect {
    /// Return the exact HTTPS redirect target the network adapter may request.
    pub fn location(&self) -> &str {
        &self.location
    }
}

/// An admitted final response whose body may enter bounded staging.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedDownloadHead {
    effective_url: String,
    artifact_name: String,
    expected_size_bytes: u64,
    expected_artifact_sha256: String,
    artifact_signature: String,
}

impl AdmittedDownloadHead {
    /// Return the exact final URL admitted for this response body.
    pub fn effective_url(&self) -> &str {
        &self.effective_url
    }

    /// Return the safe app-owned staging basename derived from strict metadata admission.
    pub fn artifact_name(&self) -> &str {
        &self.artifact_name
    }

    /// Return the provisional expected byte length retained from strict metadata admission.
    pub const fn expected_size_bytes(&self) -> u64 {
        self.expected_size_bytes
    }

    /// Return the provisional artifact digest retained from strict metadata admission.
    pub fn expected_artifact_sha256(&self) -> &str {
        &self.expected_artifact_sha256
    }

    /// Return the provisional Tauri updater signature retained from strict metadata admission.
    pub fn artifact_signature(&self) -> &str {
        &self.artifact_signature
    }

    /// Start one bounded staged body after response-head admission succeeds.
    ///
    /// Content-encoding and content-length admission run before filesystem
    /// mutation. Updater signatures and digests are defined over exact release
    /// artifact bytes, so any response content coding other than the explicit
    /// identity coding is rejected rather than relying on HTTP-client
    /// decompression behavior. `None` means the response omitted the header.
    pub fn start_staging(
        &self,
        staging_directory: &Path,
        response_content_length: Option<u64>,
        response_content_encoding: Option<&str>,
    ) -> Result<TransportDownload, TransportDownloadError> {
        if response_content_encoding
            .is_some_and(|encoding| !encoding.eq_ignore_ascii_case("identity"))
        {
            return Err(TransportDownloadError::UnsupportedContentEncoding);
        }
        let admission = ArtifactDownloadAdmission::new(
            self.expected_size_bytes,
            response_content_length,
        )
        .map_err(TransportDownloadError::Download)?;
        let staged = StagedArtifactFile::create(staging_directory, &self.artifact_name)
            .map_err(TransportDownloadError::Staging)?;
        Ok(TransportDownload {
            admission: Some(admission),
            staged: Some(staged),
        })
    }
}

/// Required next action after admitting one HTTP response head.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResponseDecision {
    /// Stream this response body into the bounded staging boundary.
    Download(AdmittedDownloadHead),
    /// Follow exactly one admitted release-asset redirect.
    FollowRedirect(AdmittedRedirect),
}

/// Deterministic transport policy derived from one strictly admitted updater target.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseTransportPolicy {
    initial_url: String,
    artifact_name: String,
    expected_size_bytes: u64,
    expected_artifact_sha256: String,
    artifact_signature: String,
}

impl ReleaseTransportPolicy {
    /// Build transport policy from the same strict provisional metadata parse.
    ///
    /// No raw JSON is accepted here. The URL, signature, size and digest are
    /// copied from `ProvisionalUpdateMetadata` and remain provisional evidence.
    /// The signature is required to have Tauri's outer canonical standard-base64
    /// envelope before any network request, but this does not verify its minisign
    /// payload or authenticate the remote metadata that carried it.
    pub fn from_provisional(
        metadata: &ProvisionalUpdateMetadata,
    ) -> Result<Self, TransportPolicyError> {
        let initial_url = metadata.artifact_url();
        let artifact_name = initial_url
            .rsplit_once('/')
            .map(|(_, name)| name)
            .filter(|name| !name.is_empty())
            .ok_or(TransportPolicyError::InvalidAdmittedArtifactUrl)?;
        if !is_canonical_standard_base64(metadata.artifact_signature()) {
            return Err(TransportPolicyError::InvalidArtifactSignatureEnvelope);
        }
        Ok(Self {
            initial_url: initial_url.to_owned(),
            artifact_name: artifact_name.to_owned(),
            expected_size_bytes: metadata.artifact_size_bytes(),
            expected_artifact_sha256: metadata.expected_artifact_sha256().to_owned(),
            artifact_signature: metadata.artifact_signature().to_owned(),
        })
    }

    /// Return the exact initial release URL admitted by the metadata boundary.
    pub fn initial_url(&self) -> &str {
        &self.initial_url
    }

    /// Admit the first HTTP response without trusting automatic redirect behavior.
    ///
    /// The network adapter must disable automatic redirects and report the exact
    /// effective URL plus an optional `Location` value. A direct `200` can
    /// stream immediately. A `302` is admitted only when its Location is an
    /// HTTPS `release-assets.githubusercontent.com` URL and becomes a distinct
    /// one-hop follow-up decision; no redirect body is exposed for staging.
    pub fn admit_initial_response(
        &self,
        status: u16,
        effective_url: &str,
        redirect_location: Option<&str>,
    ) -> Result<ResponseDecision, TransportPolicyError> {
        if effective_url != self.initial_url {
            return Err(TransportPolicyError::EffectiveUrlDrift);
        }
        match status {
            200 => Ok(ResponseDecision::Download(self.download_head(effective_url))),
            302 => {
                let location = redirect_location
                    .ok_or(TransportPolicyError::InvalidRedirectLocation)?;
                validate_release_asset_cdn_url(location)?;
                Ok(ResponseDecision::FollowRedirect(AdmittedRedirect {
                    source_url: self.initial_url.clone(),
                    location: location.to_owned(),
                }))
            }
            other => Err(TransportPolicyError::UnexpectedInitialStatus(other)),
        }
    }

    /// Admit the response produced by one previously admitted redirect.
    ///
    /// A second redirect is never followed. Only a final `200` at the exact
    /// admitted Location can expose a body to `distribution-download`.
    pub fn admit_redirect_response(
        &self,
        redirect: &AdmittedRedirect,
        status: u16,
        effective_url: &str,
    ) -> Result<AdmittedDownloadHead, TransportPolicyError> {
        if redirect.source_url != self.initial_url || effective_url != redirect.location {
            return Err(TransportPolicyError::RedirectEffectiveUrlDrift);
        }
        if (300..400).contains(&status) {
            return Err(TransportPolicyError::RedirectChainingRejected);
        }
        if status != 200 {
            return Err(TransportPolicyError::UnexpectedRedirectStatus(status));
        }
        Ok(self.download_head(effective_url))
    }

    fn download_head(&self, effective_url: &str) -> AdmittedDownloadHead {
        AdmittedDownloadHead {
            effective_url: effective_url.to_owned(),
            artifact_name: self.artifact_name.clone(),
            expected_size_bytes: self.expected_size_bytes,
            expected_artifact_sha256: self.expected_artifact_sha256.clone(),
            artifact_signature: self.artifact_signature.clone(),
        }
    }
}

/// One response body being admitted into an exclusive staging artifact.
#[derive(Debug)]
pub struct TransportDownload {
    admission: Option<ArtifactDownloadAdmission>,
    staged: Option<StagedArtifactFile>,
}

impl TransportDownload {
    /// Admit one already-bounded network chunk into the staged artifact.
    pub fn admit_chunk(&mut self, chunk: &[u8]) -> Result<(), TransportDownloadError> {
        let admission = self
            .admission
            .as_mut()
            .expect("transport admission remains present before finish");
        let staged = self
            .staged
            .as_mut()
            .expect("transport staging file remains present before finish");
        staged
            .admit_chunk(admission, chunk)
            .map_err(TransportDownloadError::Download)
    }

    /// Finish an exact response and return the still-unverified sealed descriptor.
    ///
    /// Failure leaves the staging value owned by this consumed object, so its
    /// existing drop cleanup removes partial or unverified bytes.
    pub fn finish(mut self) -> Result<SealedArtifactFile, TransportDownloadError> {
        let admission = self
            .admission
            .take()
            .expect("transport admission remains present before finish");
        let receipt = admission.finish().map_err(TransportDownloadError::Download)?;
        let staged = self
            .staged
            .take()
            .expect("transport staging file remains present before finish");
        staged.seal(receipt).map_err(TransportDownloadError::Staging)
    }
}

fn is_canonical_standard_base64(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return false;
    }

    let padding = if bytes.ends_with(b"==") {
        2
    } else if bytes.ends_with(b"=") {
        1
    } else {
        0
    };
    let data_len = bytes.len() - padding;
    if data_len == 0
        || bytes[..data_len]
            .iter()
            .any(|byte| base64_sextet(*byte).is_none())
        || bytes[data_len..].iter().any(|byte| *byte != b'=')
    {
        return false;
    }

    match padding {
        0 => true,
        1 => base64_sextet(bytes[data_len - 1])
            .is_some_and(|sextet| sextet & 0b0000_0011 == 0),
        2 => base64_sextet(bytes[data_len - 1])
            .is_some_and(|sextet| sextet & 0b0000_1111 == 0),
        _ => false,
    }
}

fn base64_sextet(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn validate_release_asset_cdn_url(value: &str) -> Result<(), TransportPolicyError> {
    if value.is_empty()
        || value.len() > MAX_REDIRECT_URL_BYTES
        || value
            .bytes()
            .any(|byte| byte.is_ascii_control() || byte.is_ascii_whitespace())
        || value.contains('#')
        || value.contains('\\')
    {
        return Err(TransportPolicyError::InvalidRedirectLocation);
    }
    let remainder = value
        .strip_prefix(RELEASE_ASSET_CDN_PREFIX)
        .ok_or(TransportPolicyError::InvalidRedirectLocation)?;
    let path = remainder.split_once('?').map_or(remainder, |(path, _)| path);
    if path.is_empty() || path.starts_with('/') {
        return Err(TransportPolicyError::InvalidRedirectLocation);
    }
    Ok(())
}
