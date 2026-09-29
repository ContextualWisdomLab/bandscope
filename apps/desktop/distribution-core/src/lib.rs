//! Pure Distribution/update security decisions for the BandScope desktop app.
//!
//! This crate deliberately has no networking, filesystem, Tauri, installer, or
//! signing capability. The caller must first authenticate updater metadata and
//! artifact signatures, then pass only validated release identity into this
//! decision core. Keeping the policy pure makes replay, rollback, target, and
//! project-schema decisions deterministic and testable on every platform.

#![forbid(unsafe_code)]

/// Maximum accepted updater target token length.
pub const MAX_TARGET_LENGTH: usize = 64;

/// A canonical stable-channel release version.
///
/// BandScope currently admits only numeric `MAJOR.MINOR.PATCH` releases in this
/// runtime security core. Prerelease/build metadata is rejected rather than
/// partially reimplementing SemVer ordering. A future beta channel must adopt
/// one canonical SemVer implementation under a separate release decision.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct StableVersion {
    major: u64,
    minor: u64,
    patch: u64,
}

impl StableVersion {
    /// Parse an exact canonical stable `MAJOR.MINOR.PATCH` version.
    pub fn parse(value: &str) -> Result<Self, UpdateRejection> {
        let mut parts = value.split('.');
        let major = parse_numeric_component(parts.next().ok_or(UpdateRejection::InvalidVersion)?)?;
        let minor = parse_numeric_component(parts.next().ok_or(UpdateRejection::InvalidVersion)?)?;
        let patch = parse_numeric_component(parts.next().ok_or(UpdateRejection::InvalidVersion)?)?;
        if parts.next().is_some() {
            return Err(UpdateRejection::InvalidVersion);
        }
        Ok(Self {
            major,
            minor,
            patch,
        })
    }

    /// Return the three numeric components for diagnostics or persistence.
    pub const fn components(self) -> (u64, u64, u64) {
        (self.major, self.minor, self.patch)
    }
}

/// Exact release identity used for freshness and equivocation checks.
///
/// `source_commit` and `artifact_sha256` are immutable evidence projected from
/// the Distribution release receipt. They are not a replacement for Tauri's
/// updater signature verification or GitHub release attestation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseIdentity {
    version: StableVersion,
    source_commit: String,
    artifact_sha256: String,
}

impl ReleaseIdentity {
    /// Construct a release identity from already-authenticated updater metadata.
    pub fn new(
        version: &str,
        source_commit: &str,
        artifact_sha256: &str,
    ) -> Result<Self, UpdateRejection> {
        let version = StableVersion::parse(version)?;
        if !is_exact_lower_hex(source_commit, 40) {
            return Err(UpdateRejection::InvalidSourceCommit);
        }
        if !is_exact_lower_hex(artifact_sha256, 64) {
            return Err(UpdateRejection::InvalidArtifactDigest);
        }
        Ok(Self {
            version,
            source_commit: source_commit.to_owned(),
            artifact_sha256: artifact_sha256.to_owned(),
        })
    }

    /// Return the canonical release version.
    pub const fn version(&self) -> StableVersion {
        self.version
    }

    /// Return the exact source commit carried by the release receipt.
    pub fn source_commit(&self) -> &str {
        &self.source_commit
    }

    /// Return the exact updater bundle SHA-256 carried by the release receipt.
    pub fn artifact_sha256(&self) -> &str {
        &self.artifact_sha256
    }
}

/// One authenticated update candidate for the current desktop target.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpdateCandidate {
    identity: ReleaseIdentity,
    target: String,
    minimum_supported_version: StableVersion,
}

impl UpdateCandidate {
    /// Construct a bounded candidate after signature and manifest verification.
    pub fn new(
        version: &str,
        source_commit: &str,
        artifact_sha256: &str,
        target: &str,
        minimum_supported_version: &str,
    ) -> Result<Self, UpdateRejection> {
        let identity = ReleaseIdentity::new(version, source_commit, artifact_sha256)?;
        if !is_safe_target(target) {
            return Err(UpdateRejection::InvalidTarget);
        }
        let minimum_supported_version = StableVersion::parse(minimum_supported_version)?;
        if minimum_supported_version > identity.version {
            return Err(UpdateRejection::MinimumExceedsCandidate);
        }
        Ok(Self {
            identity,
            target: target.to_owned(),
            minimum_supported_version,
        })
    }

    /// Return the exact release identity.
    pub fn identity(&self) -> &ReleaseIdentity {
        &self.identity
    }

    /// Return the exact Tauri updater target key admitted for this candidate.
    pub fn target(&self) -> &str {
        &self.target
    }

    /// Return the oldest installed version eligible for this automatic path.
    pub const fn minimum_supported_version(&self) -> StableVersion {
        self.minimum_supported_version
    }
}

/// Positive updater decisions returned by the pure policy core.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UpdateDecision {
    /// Offer the forward update and persist this identity as highest-seen.
    OfferAndRemember,
    /// Offer a previously authenticated highest-seen release again.
    OfferPreviouslySeen,
    /// The candidate is exactly the currently installed version.
    NoUpdate,
}

/// Fail-closed reasons for update and rollback decisions.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UpdateRejection {
    /// A version is not canonical stable `MAJOR.MINOR.PATCH`.
    InvalidVersion,
    /// The source commit is not exactly forty lowercase hexadecimal characters.
    InvalidSourceCommit,
    /// The updater artifact digest is not exactly sixty-four lowercase hex characters.
    InvalidArtifactDigest,
    /// The updater target token is empty, oversized, or contains unsafe characters.
    InvalidTarget,
    /// The release declares a minimum supported version newer than itself.
    MinimumExceedsCandidate,
    /// This installation is below the release's automatic-update compatibility floor.
    ClientBelowMinimum,
    /// The authenticated candidate targets another platform or architecture.
    UnsupportedTarget,
    /// The candidate release is older than the highest authenticated release seen locally.
    Replay,
    /// The same release version was observed with different immutable release identity.
    Equivocation,
    /// The candidate is older than the currently installed version.
    Rollback,
    /// A requested recovery target is not older than the current installation.
    NotRollbackTarget,
    /// The rollback target cannot read the current on-disk project schema.
    IncompatibleProjectSchema,
}

/// A previously trusted installer that may be considered for recovery.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RollbackTarget {
    identity: ReleaseIdentity,
    maximum_readable_project_schema: u32,
}

impl RollbackTarget {
    /// Construct last-known-good rollback metadata from trusted local evidence.
    pub fn new(
        version: &str,
        source_commit: &str,
        artifact_sha256: &str,
        maximum_readable_project_schema: u32,
    ) -> Result<Self, UpdateRejection> {
        Ok(Self {
            identity: ReleaseIdentity::new(version, source_commit, artifact_sha256)?,
            maximum_readable_project_schema,
        })
    }

    /// Return the rollback release identity.
    pub fn identity(&self) -> &ReleaseIdentity {
        &self.identity
    }

    /// Return the newest project schema this rollback build can safely read.
    pub const fn maximum_readable_project_schema(&self) -> u32 {
        self.maximum_readable_project_schema
    }
}

/// A positive recovery decision after version and project-schema checks.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RollbackDecision {
    /// The older known-good installer is compatible with current project data.
    AllowKnownGood,
}

/// Evaluate a signed/authenticated updater candidate without performing I/O.
///
/// `highest_seen` must come from Distribution-owned durable state updated after
/// an updater response has passed signature/metadata admission, even when the
/// user defers installation. This prevents a later replay from becoming fresh
/// merely because the earlier update was not installed.
pub fn evaluate_candidate(
    current_version: &str,
    expected_target: &str,
    candidate: &UpdateCandidate,
    highest_seen: Option<&ReleaseIdentity>,
) -> Result<UpdateDecision, UpdateRejection> {
    let current_version = StableVersion::parse(current_version)?;
    if candidate.target != expected_target {
        return Err(UpdateRejection::UnsupportedTarget);
    }
    if current_version < candidate.minimum_supported_version {
        return Err(UpdateRejection::ClientBelowMinimum);
    }

    if let Some(highest_seen) = highest_seen {
        if candidate.identity.version < highest_seen.version {
            return Err(UpdateRejection::Replay);
        }
        if candidate.identity.version == highest_seen.version && candidate.identity != *highest_seen {
            return Err(UpdateRejection::Equivocation);
        }
    }

    if candidate.identity.version < current_version {
        return Err(UpdateRejection::Rollback);
    }
    if candidate.identity.version == current_version {
        return Ok(UpdateDecision::NoUpdate);
    }
    if highest_seen.is_some_and(|seen| candidate.identity == *seen) {
        return Ok(UpdateDecision::OfferPreviouslySeen);
    }
    Ok(UpdateDecision::OfferAndRemember)
}

/// Evaluate whether an older known-good installer may be used for recovery.
///
/// This function does not execute the rollback. Distribution must retain and
/// authenticate the installer separately, and Project Persistence remains the
/// owner of project bytes. The only shared input here is the current persisted
/// project schema number needed to prevent an unreadable automatic downgrade.
pub fn evaluate_rollback(
    current_version: &str,
    current_project_schema: u32,
    target: &RollbackTarget,
) -> Result<RollbackDecision, UpdateRejection> {
    let current_version = StableVersion::parse(current_version)?;
    if target.identity.version >= current_version {
        return Err(UpdateRejection::NotRollbackTarget);
    }
    if target.maximum_readable_project_schema < current_project_schema {
        return Err(UpdateRejection::IncompatibleProjectSchema);
    }
    Ok(RollbackDecision::AllowKnownGood)
}

fn parse_numeric_component(value: &str) -> Result<u64, UpdateRejection> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(UpdateRejection::InvalidVersion);
    }
    value
        .parse::<u64>()
        .map_err(|_| UpdateRejection::InvalidVersion)
}

fn is_exact_lower_hex(value: &str, expected_length: usize) -> bool {
    value.len() == expected_length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn is_safe_target(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_TARGET_LENGTH
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const SOURCE_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const DIGEST_A: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const DIGEST_B: &str =
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const TARGET: &str = "windows-x86_64";

    fn candidate(version: &str, minimum: &str) -> UpdateCandidate {
        UpdateCandidate::new(version, SOURCE_A, DIGEST_A, TARGET, minimum)
            .expect("test candidate should be valid")
    }

    fn identity(version: &str) -> ReleaseIdentity {
        ReleaseIdentity::new(version, SOURCE_A, DIGEST_A)
            .expect("test identity should be valid")
    }

    #[test]
    fn stable_version_accepts_only_canonical_numeric_triplets() {
        let zero = StableVersion::parse("0.0.0").expect("zero version should parse");
        assert_eq!(zero.components(), (0, 0, 0));
        let release = StableVersion::parse("12.34.56").expect("release should parse");
        assert_eq!(release.components(), (12, 34, 56));
        let maximum = StableVersion::parse("18446744073709551615.0.1")
            .expect("u64 maximum should parse");
        assert_eq!(maximum.components().0, u64::MAX);

        for invalid in [
            "",
            "1",
            "1.2",
            "1.2.3.4",
            "01.2.3",
            "1.02.3",
            "1.2.03",
            "1.2.-3",
            "1.2.3-alpha",
            "1.2.3+build",
            "v1.2.3",
            " 1.2.3",
            "1.2.3 ",
            "18446744073709551616.0.0",
        ] {
            assert_eq!(
                StableVersion::parse(invalid),
                Err(UpdateRejection::InvalidVersion),
                "{invalid} must fail closed"
            );
        }
    }

    #[test]
    fn release_identity_requires_exact_lowercase_immutable_ids() {
        let accepted = ReleaseIdentity::new("1.2.3", SOURCE_A, DIGEST_A)
            .expect("canonical identity should be accepted");
        assert_eq!(accepted.version().components(), (1, 2, 3));
        assert_eq!(accepted.source_commit(), SOURCE_A);
        assert_eq!(accepted.artifact_sha256(), DIGEST_A);

        assert_eq!(
            ReleaseIdentity::new("1.2.3", "abc", DIGEST_A),
            Err(UpdateRejection::InvalidSourceCommit)
        );
        assert_eq!(
            ReleaseIdentity::new(
                "1.2.3",
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                DIGEST_A,
            ),
            Err(UpdateRejection::InvalidSourceCommit)
        );
        assert_eq!(
            ReleaseIdentity::new("1.2.3", SOURCE_A, "abc"),
            Err(UpdateRejection::InvalidArtifactDigest)
        );
        assert_eq!(
            ReleaseIdentity::new(
                "1.2.3",
                SOURCE_A,
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            ),
            Err(UpdateRejection::InvalidArtifactDigest)
        );
    }

    #[test]
    fn candidate_admission_bounds_target_and_version_floor() {
        let accepted = candidate("2.0.0", "1.0.0");
        assert_eq!(accepted.identity().version().components(), (2, 0, 0));
        assert_eq!(accepted.target(), TARGET);
        assert_eq!(accepted.minimum_supported_version().components(), (1, 0, 0));

        for invalid_target in ["", "windows/x86_64", "windows x86_64"] {
            assert_eq!(
                UpdateCandidate::new("2.0.0", SOURCE_A, DIGEST_A, invalid_target, "1.0.0"),
                Err(UpdateRejection::InvalidTarget)
            );
        }
        let oversized_target = "a".repeat(MAX_TARGET_LENGTH + 1);
        assert_eq!(
            UpdateCandidate::new("2.0.0", SOURCE_A, DIGEST_A, &oversized_target, "1.0.0"),
            Err(UpdateRejection::InvalidTarget)
        );
        assert_eq!(
            UpdateCandidate::new("1.0.0", SOURCE_A, DIGEST_A, TARGET, "2.0.0"),
            Err(UpdateRejection::MinimumExceedsCandidate)
        );
    }

    #[test]
    fn forward_candidate_is_offered_and_remembered() {
        assert_eq!(
            evaluate_candidate("1.0.0", TARGET, &candidate("1.1.0", "1.0.0"), None),
            Ok(UpdateDecision::OfferAndRemember)
        );
    }

    #[test]
    fn exact_installed_candidate_is_not_reinstalled() {
        assert_eq!(
            evaluate_candidate("1.1.0", TARGET, &candidate("1.1.0", "1.0.0"), None),
            Ok(UpdateDecision::NoUpdate)
        );
    }

    #[test]
    fn lower_candidate_is_rejected_as_rollback() {
        assert_eq!(
            evaluate_candidate("2.0.0", TARGET, &candidate("1.9.9", "1.0.0"), None),
            Err(UpdateRejection::Rollback)
        );
    }

    #[test]
    fn highest_seen_version_rejects_replay_before_install() {
        let highest = identity("2.0.0");
        assert_eq!(
            evaluate_candidate(
                "1.0.0",
                TARGET,
                &candidate("1.5.0", "1.0.0"),
                Some(&highest),
            ),
            Err(UpdateRejection::Replay)
        );
    }

    #[test]
    fn same_version_with_different_release_identity_is_equivocation() {
        let highest = identity("2.0.0");
        let conflicting = UpdateCandidate::new("2.0.0", SOURCE_B, DIGEST_B, TARGET, "1.0.0")
            .expect("conflicting test candidate should still be structurally valid");
        assert_eq!(
            evaluate_candidate("1.0.0", TARGET, &conflicting, Some(&highest)),
            Err(UpdateRejection::Equivocation)
        );
    }

    #[test]
    fn exact_highest_seen_forward_release_can_be_reoffered() {
        let highest = identity("2.0.0");
        assert_eq!(
            evaluate_candidate(
                "1.0.0",
                TARGET,
                &candidate("2.0.0", "1.0.0"),
                Some(&highest),
            ),
            Ok(UpdateDecision::OfferPreviouslySeen)
        );
    }

    #[test]
    fn automatic_path_rejects_clients_below_release_floor() {
        assert_eq!(
            evaluate_candidate("0.9.0", TARGET, &candidate("2.0.0", "1.0.0"), None),
            Err(UpdateRejection::ClientBelowMinimum)
        );
    }

    #[test]
    fn candidate_must_match_current_platform_target() {
        assert_eq!(
            evaluate_candidate(
                "1.0.0",
                "darwin-aarch64",
                &candidate("2.0.0", "1.0.0"),
                None,
            ),
            Err(UpdateRejection::UnsupportedTarget)
        );
    }

    #[test]
    fn malformed_current_version_fails_closed() {
        assert_eq!(
            evaluate_candidate("v1.0.0", TARGET, &candidate("2.0.0", "1.0.0"), None),
            Err(UpdateRejection::InvalidVersion)
        );
    }

    #[test]
    fn compatible_older_known_good_installer_can_be_used_for_recovery() {
        let target = RollbackTarget::new("1.5.0", SOURCE_A, DIGEST_A, 7)
            .expect("rollback fixture should be valid");
        assert_eq!(target.identity().version().components(), (1, 5, 0));
        assert_eq!(target.maximum_readable_project_schema(), 7);
        assert_eq!(
            evaluate_rollback("2.0.0", 7, &target),
            Ok(RollbackDecision::AllowKnownGood)
        );
    }

    #[test]
    fn rollback_rejects_project_schema_newer_than_target_reader() {
        let target = RollbackTarget::new("1.5.0", SOURCE_A, DIGEST_A, 6)
            .expect("rollback fixture should be valid");
        assert_eq!(
            evaluate_rollback("2.0.0", 7, &target),
            Err(UpdateRejection::IncompatibleProjectSchema)
        );
    }

    #[test]
    fn rollback_target_must_be_strictly_older() {
        let same = RollbackTarget::new("2.0.0", SOURCE_A, DIGEST_A, 7)
            .expect("rollback fixture should be valid");
        let newer = RollbackTarget::new("2.1.0", SOURCE_A, DIGEST_A, 7)
            .expect("rollback fixture should be valid");
        assert_eq!(
            evaluate_rollback("2.0.0", 7, &same),
            Err(UpdateRejection::NotRollbackTarget)
        );
        assert_eq!(
            evaluate_rollback("2.0.0", 7, &newer),
            Err(UpdateRejection::NotRollbackTarget)
        );
        assert_eq!(
            evaluate_rollback("2.0", 7, &same),
            Err(UpdateRejection::InvalidVersion)
        );
    }
}
