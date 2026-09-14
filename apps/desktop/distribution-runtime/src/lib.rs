//! Bounded admission for BandScope updater metadata before runtime trust is established.
//!
//! Tauri's updater verifies the downloaded updater artifact signature, but the
//! static JSON response itself is remote metadata. `Update::raw_json` therefore
//! remains provisional input: this crate validates its exact BandScope schema
//! and resource bounds, but it deliberately does not write highest-seen state
//! or return an authenticated `UpdateCandidate`. A later adapter must add an
//! authenticated metadata binding before Distribution may persist freshness.

#![forbid(unsafe_code)]

use bandscope_distribution_core::{UpdateCandidate, UpdateRejection};
use std::path::{Path, PathBuf};

/// Maximum accepted updater JSON payload before parsing.
pub const MAX_RAW_JSON_BYTES: usize = 256 * 1024;
/// Maximum accepted signature text inside one platform entry.
pub const MAX_SIGNATURE_BYTES: usize = 64 * 1024;
/// Maximum accepted updater URL length.
pub const MAX_URL_BYTES: usize = 2 * 1024;
/// Hard ceiling for one declared updater artifact.
pub const MAX_DECLARED_UPDATER_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Static updater targets emitted by BandScope's release builder.
pub const SUPPORTED_TARGETS: [&str; 4] = [
    "windows-x86_64",
    "windows-aarch64",
    "darwin-x86_64",
    "darwin-aarch64",
];

const MAX_JSON_DEPTH: usize = 8;
const MAX_JSON_MEMBERS: usize = 64;
const MAX_STRING_BYTES: usize = 128 * 1024;
const STATE_DIRECTORY: &str = "distribution";
const HIGHEST_SEEN_STATE_FILE: &str = "highest-seen-v1.log";
const RELEASE_HOST: &str = "github.com";
const RELEASE_OWNER: &str = "ContextualWisdomLab";
const RELEASE_REPOSITORY: &str = "bandscope";

/// Fail-closed reasons for provisional updater metadata admission.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MetadataError {
    /// The updater response is empty or exceeds the bounded JSON budget.
    InvalidSize,
    /// The updater response is not valid UTF-8.
    InvalidUtf8,
    /// The updater response is not valid within BandScope's strict JSON subset.
    InvalidJson,
    /// A JSON object contains a duplicate member name.
    DuplicateMember,
    /// An object has a missing or unexpected member.
    UnexpectedShape,
    /// The requested desktop target is not one of BandScope's release targets.
    UnsupportedTarget,
    /// A platform signature field is empty, oversized, or contains a NUL byte.
    InvalidSignature,
    /// A platform URL is not the canonical bounded GitHub exact-tag release URL.
    InvalidUrl,
    /// An updater artifact declares a zero or excessive byte length.
    InvalidArtifactSize,
    /// Core release-identity syntax validation failed.
    InvalidReleaseIdentity(UpdateRejection),
    /// The app-local-data root is not an absolute path.
    InvalidAppDataRoot,
}

/// Strictly parsed but still unauthenticated updater metadata.
///
/// This type intentionally exposes no method that writes Distribution state or
/// calls the anti-replay decision core. The remote JSON fields are not promoted
/// to durable release authority merely because their syntax is valid.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalUpdateMetadata {
    candidate: UpdateCandidate,
    artifact_size_bytes: u64,
}

impl ProvisionalUpdateMetadata {
    /// Return the canonical numeric release version components.
    pub fn version_components(&self) -> (u64, u64, u64) {
        self.candidate.identity().version().components()
    }

    /// Return the exact release source commit announced by remote metadata.
    pub fn source_commit(&self) -> &str {
        self.candidate.identity().source_commit()
    }

    /// Return the expected updater artifact SHA-256 announced by remote metadata.
    pub fn expected_artifact_sha256(&self) -> &str {
        self.candidate.identity().artifact_sha256()
    }

    /// Return the updater target selected for this installation.
    pub fn target(&self) -> &str {
        self.candidate.target()
    }

    /// Return the declared updater artifact length.
    pub const fn artifact_size_bytes(&self) -> u64 {
        self.artifact_size_bytes
    }

    /// Return the minimum client version allowed on the automatic update path.
    pub fn minimum_supported_version_components(&self) -> (u64, u64, u64) {
        self.candidate.minimum_supported_version().components()
    }
}

/// Parse and bound an untrusted Tauri static updater response.
///
/// Security Notes: `raw_json` is remote metadata, not proof that the announced
/// version, commit, or digest is authentic. The function rejects duplicate and
/// unknown members, enforces all four release targets, bounds signature/URL and
/// artifact-size fields, pins artifact URLs to BandScope's exact GitHub release
/// namespace, and delegates release-identity syntax to the pure Distribution
/// core. Success is deliberately *provisional* and must never be persisted as
/// highest-seen authority without a separate authenticated metadata binding.
pub fn admit_untrusted_raw_json(
    raw_json: &[u8],
    expected_target: &str,
) -> Result<ProvisionalUpdateMetadata, MetadataError> {
    if raw_json.is_empty() || raw_json.len() > MAX_RAW_JSON_BYTES {
        return Err(MetadataError::InvalidSize);
    }
    if !SUPPORTED_TARGETS.contains(&expected_target) {
        return Err(MetadataError::UnsupportedTarget);
    }
    let text = std::str::from_utf8(raw_json).map_err(|_| MetadataError::InvalidUtf8)?;
    let document = Parser::new(text.as_bytes()).parse_document()?;
    let root = as_object(&document)?;
    require_exact_members(root, &["version", "platforms", "bandscope"])?;

    let version = as_string(field(root, "version")?)?;
    let platforms = as_object(field(root, "platforms")?)?;
    require_exact_members(platforms, &SUPPORTED_TARGETS)?;
    for target in SUPPORTED_TARGETS {
        let platform = as_object(field(platforms, target)?)?;
        require_exact_members(platform, &["signature", "url"])?;
        validate_signature(as_string(field(platform, "signature")?)?)?;
        validate_release_url(as_string(field(platform, "url")?)?, version)?;
    }

    let bandscope = as_object(field(root, "bandscope")?)?;
    require_exact_members(
        bandscope,
        &[
            "schemaVersion",
            "sourceCommit",
            "minimumSupportedVersion",
            "artifacts",
        ],
    )?;
    if as_number(field(bandscope, "schemaVersion")?)? != 1 {
        return Err(MetadataError::UnexpectedShape);
    }
    let source_commit = as_string(field(bandscope, "sourceCommit")?)?;
    let minimum_supported_version =
        as_string(field(bandscope, "minimumSupportedVersion")?)?;
    let artifacts = as_object(field(bandscope, "artifacts")?)?;
    require_exact_members(artifacts, &SUPPORTED_TARGETS)?;

    let mut selected_size = None;
    let mut selected_digest = None;
    for target in SUPPORTED_TARGETS {
        let artifact = as_object(field(artifacts, target)?)?;
        require_exact_members(artifact, &["sizeBytes", "sha256"])?;
        let size = as_number(field(artifact, "sizeBytes")?)?;
        if size == 0 || size > MAX_DECLARED_UPDATER_BYTES {
            return Err(MetadataError::InvalidArtifactSize);
        }
        let digest = as_string(field(artifact, "sha256")?)?;
        if target == expected_target {
            selected_size = Some(size);
            selected_digest = Some(digest);
        } else {
            validate_candidate_syntax(
                version,
                source_commit,
                digest,
                target,
                minimum_supported_version,
            )?;
        }
    }

    let artifact_size_bytes = selected_size.ok_or(MetadataError::UnexpectedShape)?;
    let artifact_sha256 = selected_digest.ok_or(MetadataError::UnexpectedShape)?;
    let candidate = validate_candidate_syntax(
        version,
        source_commit,
        artifact_sha256,
        expected_target,
        minimum_supported_version,
    )?;

    Ok(ProvisionalUpdateMetadata {
        candidate,
        artifact_size_bytes,
    })
}

/// Return the fixed Distribution-owned highest-seen path under Tauri app data.
///
/// This is a path projection only. It does not create directories or files and
/// it does not persist provisional metadata. `bandscope-distribution-state`
/// remains the sole owner of state-file admission and durability semantics.
pub fn app_owned_highest_seen_path(app_local_data_dir: &Path) -> Result<PathBuf, MetadataError> {
    if !app_local_data_dir.is_absolute() {
        return Err(MetadataError::InvalidAppDataRoot);
    }
    Ok(app_local_data_dir
        .join(STATE_DIRECTORY)
        .join(HIGHEST_SEEN_STATE_FILE))
}

fn validate_candidate_syntax(
    version: &str,
    source_commit: &str,
    artifact_sha256: &str,
    target: &str,
    minimum_supported_version: &str,
) -> Result<UpdateCandidate, MetadataError> {
    UpdateCandidate::new(
        version,
        source_commit,
        artifact_sha256,
        target,
        minimum_supported_version,
    )
    .map_err(MetadataError::InvalidReleaseIdentity)
}

fn validate_signature(value: &str) -> Result<(), MetadataError> {
    if value.is_empty() || value.len() > MAX_SIGNATURE_BYTES || value.as_bytes().contains(&0) {
        return Err(MetadataError::InvalidSignature);
    }
    Ok(())
}

fn validate_release_url(value: &str, version: &str) -> Result<(), MetadataError> {
    if value.is_empty()
        || value.len() > MAX_URL_BYTES
        || value.bytes().any(|byte| byte.is_ascii_control() || byte.is_ascii_whitespace())
        || value.contains(['?', '#', '\\'])
    {
        return Err(MetadataError::InvalidUrl);
    }

    let remainder = value
        .strip_prefix("https://")
        .ok_or(MetadataError::InvalidUrl)?;
    let (authority, path) = remainder
        .split_once('/')
        .ok_or(MetadataError::InvalidUrl)?;
    if !authority.eq_ignore_ascii_case(RELEASE_HOST) || authority.contains('@') {
        return Err(MetadataError::InvalidUrl);
    }

    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() != 6
        || segments[0] != RELEASE_OWNER
        || segments[1] != RELEASE_REPOSITORY
        || segments[2] != "releases"
        || segments[3] != "download"
        || segments[4] != format!("v{version}")
        || !is_safe_release_asset_name(segments[5])
    {
        return Err(MetadataError::InvalidUrl);
    }
    Ok(())
}

fn is_safe_release_asset_name(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')
        })
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum JsonValue {
    Object(Vec<(String, JsonValue)>),
    String(String),
    Number(u64),
}

struct Parser<'a> {
    bytes: &'a [u8],
    position: usize,
    depth: usize,
    members: usize,
}

impl<'a> Parser<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self {
            bytes,
            position: 0,
            depth: 0,
            members: 0,
        }
    }

    fn parse_document(mut self) -> Result<JsonValue, MetadataError> {
        self.skip_whitespace();
        let value = self.parse_value()?;
        self.skip_whitespace();
        if self.position != self.bytes.len() {
            return Err(MetadataError::InvalidJson);
        }
        Ok(value)
    }

    fn parse_value(&mut self) -> Result<JsonValue, MetadataError> {
        self.skip_whitespace();
        match self.peek() {
            Some(b'{') => self.parse_object(),
            Some(b'"') => self.parse_string().map(JsonValue::String),
            Some(b'0'..=b'9') => self.parse_number().map(JsonValue::Number),
            _ => Err(MetadataError::InvalidJson),
        }
    }

    fn parse_object(&mut self) -> Result<JsonValue, MetadataError> {
        if self.depth >= MAX_JSON_DEPTH {
            return Err(MetadataError::InvalidJson);
        }
        self.consume(b'{')?;
        self.depth += 1;
        self.skip_whitespace();
        let mut entries = Vec::new();
        if self.peek() == Some(b'}') {
            self.position += 1;
            self.depth -= 1;
            return Ok(JsonValue::Object(entries));
        }

        loop {
            self.skip_whitespace();
            if self.peek() != Some(b'"') {
                self.depth -= 1;
                return Err(MetadataError::InvalidJson);
            }
            let key = self.parse_string()?;
            if entries.iter().any(|(existing, _)| existing == &key) {
                self.depth -= 1;
                return Err(MetadataError::DuplicateMember);
            }
            self.members += 1;
            if self.members > MAX_JSON_MEMBERS {
                self.depth -= 1;
                return Err(MetadataError::InvalidJson);
            }
            self.skip_whitespace();
            self.consume(b':')?;
            let value = self.parse_value()?;
            entries.push((key, value));
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.position += 1,
                Some(b'}') => {
                    self.position += 1;
                    self.depth -= 1;
                    return Ok(JsonValue::Object(entries));
                }
                _ => {
                    self.depth -= 1;
                    return Err(MetadataError::InvalidJson);
                }
            }
        }
    }

    fn parse_string(&mut self) -> Result<String, MetadataError> {
        self.consume(b'"')?;
        let mut output = String::new();
        loop {
            let byte = self.next().ok_or(MetadataError::InvalidJson)?;
            match byte {
                b'"' => break,
                b'\\' => self.parse_escape(&mut output)?,
                0x00..=0x1f => return Err(MetadataError::InvalidJson),
                0x20..=0x7f => output.push(char::from(byte)),
                _ => {
                    self.position -= 1;
                    let remaining = std::str::from_utf8(&self.bytes[self.position..])
                        .map_err(|_| MetadataError::InvalidUtf8)?;
                    let character = remaining.chars().next().ok_or(MetadataError::InvalidJson)?;
                    output.push(character);
                    self.position += character.len_utf8();
                }
            }
            if output.len() > MAX_STRING_BYTES {
                return Err(MetadataError::InvalidJson);
            }
        }
        Ok(output)
    }

    fn parse_escape(&mut self, output: &mut String) -> Result<(), MetadataError> {
        let escaped = self.next().ok_or(MetadataError::InvalidJson)?;
        match escaped {
            b'"' => output.push('"'),
            b'\\' => output.push('\\'),
            b'/' => output.push('/'),
            b'b' => output.push('\u{0008}'),
            b'f' => output.push('\u{000c}'),
            b'n' => output.push('\n'),
            b'r' => output.push('\r'),
            b't' => output.push('\t'),
            b'u' => {
                let first = self.parse_hex_quad()?;
                let codepoint = if (0xd800..=0xdbff).contains(&first) {
                    self.consume(b'\\')?;
                    self.consume(b'u')?;
                    let second = self.parse_hex_quad()?;
                    if !(0xdc00..=0xdfff).contains(&second) {
                        return Err(MetadataError::InvalidJson);
                    }
                    0x10000 + (((first - 0xd800) as u32) << 10) + (second - 0xdc00) as u32
                } else if (0xdc00..=0xdfff).contains(&first) {
                    return Err(MetadataError::InvalidJson);
                } else {
                    first as u32
                };
                let character = char::from_u32(codepoint).ok_or(MetadataError::InvalidJson)?;
                output.push(character);
            }
            _ => return Err(MetadataError::InvalidJson),
        }
        Ok(())
    }

    fn parse_hex_quad(&mut self) -> Result<u16, MetadataError> {
        let mut value = 0_u16;
        for _ in 0..4 {
            let byte = self.next().ok_or(MetadataError::InvalidJson)?;
            let digit = match byte {
                b'0'..=b'9' => (byte - b'0') as u16,
                b'a'..=b'f' => (byte - b'a' + 10) as u16,
                b'A'..=b'F' => (byte - b'A' + 10) as u16,
                _ => return Err(MetadataError::InvalidJson),
            };
            value = (value << 4) | digit;
        }
        Ok(value)
    }

    fn parse_number(&mut self) -> Result<u64, MetadataError> {
        let start = self.position;
        match self.peek() {
            Some(b'0') => {
                self.position += 1;
                if matches!(self.peek(), Some(b'0'..=b'9')) {
                    return Err(MetadataError::InvalidJson);
                }
            }
            Some(b'1'..=b'9') => {
                self.position += 1;
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.position += 1;
                }
            }
            _ => return Err(MetadataError::InvalidJson),
        }
        let text = std::str::from_utf8(&self.bytes[start..self.position])
            .map_err(|_| MetadataError::InvalidUtf8)?;
        text.parse::<u64>().map_err(|_| MetadataError::InvalidJson)
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.position += 1;
        }
    }

    fn consume(&mut self, expected: u8) -> Result<(), MetadataError> {
        if self.next() != Some(expected) {
            return Err(MetadataError::InvalidJson);
        }
        Ok(())
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    fn next(&mut self) -> Option<u8> {
        let byte = self.peek()?;
        self.position += 1;
        Some(byte)
    }
}

fn as_object(value: &JsonValue) -> Result<&[(String, JsonValue)], MetadataError> {
    match value {
        JsonValue::Object(entries) => Ok(entries),
        _ => Err(MetadataError::UnexpectedShape),
    }
}

fn as_string(value: &JsonValue) -> Result<&str, MetadataError> {
    match value {
        JsonValue::String(text) => Ok(text),
        _ => Err(MetadataError::UnexpectedShape),
    }
}

fn as_number(value: &JsonValue) -> Result<u64, MetadataError> {
    match value {
        JsonValue::Number(number) => Ok(*number),
        _ => Err(MetadataError::UnexpectedShape),
    }
}

fn field<'a>(
    object: &'a [(String, JsonValue)],
    name: &str,
) -> Result<&'a JsonValue, MetadataError> {
    object
        .iter()
        .find_map(|(key, value)| (key == name).then_some(value))
        .ok_or(MetadataError::UnexpectedShape)
}

fn require_exact_members(
    object: &[(String, JsonValue)],
    expected: &[&str],
) -> Result<(), MetadataError> {
    if object.len() != expected.len()
        || object
            .iter()
            .any(|(key, _)| !expected.contains(&key.as_str()))
        || expected
            .iter()
            .any(|name| !object.iter().any(|(key, _)| key == name))
    {
        return Err(MetadataError::UnexpectedShape);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const DIGEST_WINDOWS_X86: &str =
        "1111111111111111111111111111111111111111111111111111111111111111";
    const DIGEST_WINDOWS_ARM: &str =
        "2222222222222222222222222222222222222222222222222222222222222222";
    const DIGEST_DARWIN_X86: &str =
        "3333333333333333333333333333333333333333333333333333333333333333";
    const DIGEST_DARWIN_ARM: &str =
        "4444444444444444444444444444444444444444444444444444444444444444";

    fn manifest(version: &str) -> String {
        format!(
            r#"{{
  "version": "{version}",
  "platforms": {{
    "windows-x86_64": {{"signature": "sig-win-x86\\n", "url": "https://github.com/ContextualWisdomLab/bandscope/releases/download/v{version}/win-x86.zip"}},
    "windows-aarch64": {{"signature": "sig-win-arm", "url": "https://github.com/ContextualWisdomLab/bandscope/releases/download/v{version}/win-arm.zip"}},
    "darwin-x86_64": {{"signature": "sig-mac-x86", "url": "https://github.com/ContextualWisdomLab/bandscope/releases/download/v{version}/mac-x86.tar.gz"}},
    "darwin-aarch64": {{"signature": "sig-mac-arm", "url": "https://github.com/ContextualWisdomLab/bandscope/releases/download/v{version}/mac-arm.tar.gz"}}
  }},
  "bandscope": {{
    "schemaVersion": 1,
    "sourceCommit": "{SOURCE}",
    "minimumSupportedVersion": "0.1.3",
    "artifacts": {{
      "windows-x86_64": {{"sizeBytes": 101, "sha256": "{DIGEST_WINDOWS_X86}"}},
      "windows-aarch64": {{"sizeBytes": 102, "sha256": "{DIGEST_WINDOWS_ARM}"}},
      "darwin-x86_64": {{"sizeBytes": 103, "sha256": "{DIGEST_DARWIN_X86}"}},
      "darwin-aarch64": {{"sizeBytes": 104, "sha256": "{DIGEST_DARWIN_ARM}"}}
    }}
  }}
}}"#
        )
    }

    #[test]
    fn strict_manifest_is_admitted_only_as_provisional_metadata() {
        let metadata = admit_untrusted_raw_json(manifest("2.0.0").as_bytes(), "windows-x86_64")
            .expect("current publication shape should parse");
        assert_eq!(metadata.version_components(), (2, 0, 0));
        assert_eq!(metadata.source_commit(), SOURCE);
        assert_eq!(metadata.expected_artifact_sha256(), DIGEST_WINDOWS_X86);
        assert_eq!(metadata.target(), "windows-x86_64");
        assert_eq!(metadata.artifact_size_bytes(), 101);
        assert_eq!(metadata.minimum_supported_version_components(), (0, 1, 3));
    }

    #[test]
    fn duplicate_or_unknown_members_fail_closed() {
        let duplicate = manifest("2.0.0").replacen(
            "\"version\": \"2.0.0\",",
            "\"version\": \"2.0.0\", \"version\": \"9.9.9\",",
            1,
        );
        assert_eq!(
            admit_untrusted_raw_json(duplicate.as_bytes(), "windows-x86_64"),
            Err(MetadataError::DuplicateMember)
        );

        let unknown = manifest("2.0.0").replacen(
            "\"schemaVersion\": 1,",
            "\"schemaVersion\": 1, \"trusted\": 1,",
            1,
        );
        assert_eq!(
            admit_untrusted_raw_json(unknown.as_bytes(), "windows-x86_64"),
            Err(MetadataError::UnexpectedShape)
        );
    }

    #[test]
    fn malformed_identity_and_mutable_release_urls_fail_closed() {
        let bad_version = manifest("02.0.0");
        assert_eq!(
            admit_untrusted_raw_json(bad_version.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidReleaseIdentity(
                UpdateRejection::InvalidVersion
            ))
        );

        let mutable_url = manifest("2.0.0").replace(
            "/releases/download/v2.0.0/",
            "/releases/latest/download/",
        );
        assert_eq!(
            admit_untrusted_raw_json(mutable_url.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidUrl)
        );
    }

    #[test]
    fn release_download_namespace_is_pinned_before_any_network_adapter_can_use_it() {
        let hostile_host = manifest("2.0.0").replace("https://github.com/", "https://evil.example/");
        assert_eq!(
            admit_untrusted_raw_json(hostile_host.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidUrl)
        );

        let hostile_repo = manifest("2.0.0").replace(
            "/ContextualWisdomLab/bandscope/",
            "/attacker/bandscope/",
        );
        assert_eq!(
            admit_untrusted_raw_json(hostile_repo.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidUrl)
        );

        let userinfo = manifest("2.0.0").replace(
            "https://github.com/",
            "https://github.com@evil.example/",
        );
        assert_eq!(
            admit_untrusted_raw_json(userinfo.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidUrl)
        );

        let query = manifest("2.0.0").replace(
            "win-x86.zip\"",
            "win-x86.zip?mirror=/releases/download/v2.0.0/other.zip\"",
        );
        assert_eq!(
            admit_untrusted_raw_json(query.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidUrl)
        );

        let encoded_path = manifest("2.0.0").replace("win-x86.zip", "win%2Fx86.zip");
        assert_eq!(
            admit_untrusted_raw_json(encoded_path.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidUrl)
        );
    }

    #[test]
    fn resource_bounds_and_target_set_fail_closed() {
        assert_eq!(
            admit_untrusted_raw_json(&vec![b' '; MAX_RAW_JSON_BYTES + 1], "windows-x86_64"),
            Err(MetadataError::InvalidSize)
        );
        assert_eq!(
            admit_untrusted_raw_json(manifest("2.0.0").as_bytes(), "linux-x86_64"),
            Err(MetadataError::UnsupportedTarget)
        );

        let zero_size = manifest("2.0.0").replacen("\"sizeBytes\": 101", "\"sizeBytes\": 0", 1);
        assert_eq!(
            admit_untrusted_raw_json(zero_size.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidArtifactSize)
        );
    }

    #[test]
    fn app_owned_state_path_is_fixed_but_not_created() {
        let root = std::env::temp_dir().join(format!(
            "bandscope-runtime-path-{}",
            std::process::id()
        ));
        let path = app_owned_highest_seen_path(&root).expect("temp path should be absolute");
        assert_eq!(
            path,
            root.join("distribution").join("highest-seen-v1.log")
        );
        assert!(!path.exists(), "path projection must not persist untrusted metadata");
        assert_eq!(
            app_owned_highest_seen_path(Path::new("relative/app-data")),
            Err(MetadataError::InvalidAppDataRoot)
        );
    }

    #[test]
    fn parser_accepts_json_unicode_escape_but_rejects_invalid_surrogate() {
        let escaped = manifest("2.0.0").replace("sig-win-arm", "sig-\\u2603");
        assert!(admit_untrusted_raw_json(escaped.as_bytes(), "windows-x86_64").is_ok());

        let invalid = manifest("2.0.0").replace("sig-win-arm", "sig-\\uD800x");
        assert_eq!(
            admit_untrusted_raw_json(invalid.as_bytes(), "windows-x86_64"),
            Err(MetadataError::InvalidJson)
        );
    }
}
