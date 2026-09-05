//! Path-free contract for locally generated playable stem artifacts.
//!
//! The analysis process may publish aligned WAV files below an app-owned
//! project temporary root, but it cannot grant filesystem authority by returning
//! a path. This module validates the path-free metadata used by the native
//! process to derive and verify the only permitted file locations.

use serde::{Deserialize, Deserializer, Serialize};
use std::path::{Path, PathBuf};

/// Version of the playable-stem artifact and metadata contract.
pub const PLAYABLE_STEM_ARTIFACT_VERSION: u8 = 1;

/// Smallest accepted sample rate for generated playback artifacts.
pub const MIN_PLAYBACK_SAMPLE_RATE_HZ: u32 = 8_000;

/// Largest accepted sample rate for generated playback artifacts.
pub const MAX_PLAYBACK_SAMPLE_RATE_HZ: u32 = 192_000;

const PCM16_BYTES_PER_SAMPLE: u64 = 2;
const CANONICAL_WAVE_HEADER_BYTES: u64 = 44;
const RIFF_CHUNK_PREFIX_BYTES: u64 = 8;
const RIFF_CHUNK_OVERHEAD_BYTES: u64 =
    CANONICAL_WAVE_HEADER_BYTES - RIFF_CHUNK_PREFIX_BYTES;
const SHA256_HEX_CHARACTER_COUNT: usize = 64;
const DURATION_RELATIVE_TOLERANCE: f64 = 1e-12;

/// Largest mono PCM16 sample count representable by a classic RIFF/WAV header.
pub const MAX_CLASSIC_RIFF_PCM16_SAMPLE_COUNT: u64 =
    (u32::MAX as u64 - RIFF_CHUNK_OVERHEAD_BYTES) / PCM16_BYTES_PER_SAMPLE;

/// Canonical source kinds produced by the current BandScope separation model.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStemKind {
    /// Isolated vocal source.
    Vocals,
    /// Isolated bass source.
    Bass,
    /// Isolated drum source.
    Drums,
    /// Remaining instruments not identified as a more specific source.
    Other,
}

impl PlaybackStemKind {
    /// Return all supported sources in their canonical wire order.
    pub const fn canonical_order() -> [Self; 4] {
        [Self::Vocals, Self::Bass, Self::Drums, Self::Other]
    }

    /// Return the exact artifact identifier owned by this source kind.
    pub const fn artifact_id(self) -> &'static str {
        match self {
            Self::Vocals => "stem-vocals",
            Self::Bass => "stem-bass",
            Self::Drums => "stem-drums",
            Self::Other => "stem-other",
        }
    }

    /// Return the fixed WAV filename owned by this source kind.
    pub const fn file_name(self) -> &'static str {
        match self {
            Self::Vocals => "vocals.wav",
            Self::Bass => "bass.wav",
            Self::Drums => "drums.wav",
            Self::Other => "other.wav",
        }
    }
}

/// Path-free metadata for one generated source file.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayableStemArtifactReference {
    artifact_id: String,
    stem_kind: PlaybackStemKind,
    file_size_bytes: u64,
    content_hash_sha256: String,
    media_type: String,
    sample_rate: u32,
    channel_count: u8,
    sample_count: u64,
    duration_seconds: f64,
}

impl PlayableStemArtifactReference {
    /// Return the canonical artifact identifier.
    pub fn artifact_id(&self) -> &str {
        &self.artifact_id
    }

    /// Return the canonical source kind.
    pub const fn stem_kind(&self) -> PlaybackStemKind {
        self.stem_kind
    }

    /// Return the expected on-disk byte size.
    pub const fn file_size_bytes(&self) -> u64 {
        self.file_size_bytes
    }

    /// Return the lowercase SHA-256 digest of the complete WAV file.
    pub fn content_hash_sha256(&self) -> &str {
        &self.content_hash_sha256
    }

    /// Return the exact media type for the generated artifact.
    pub fn media_type(&self) -> &str {
        &self.media_type
    }

    /// Return the expected sample rate.
    pub const fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Return the expected channel count.
    pub const fn channel_count(&self) -> u8 {
        self.channel_count
    }

    /// Return the expected number of mono PCM samples.
    pub const fn sample_count(&self) -> u64 {
        self.sample_count
    }

    /// Return the expected media duration.
    pub const fn duration_seconds(&self) -> f64 {
        self.duration_seconds
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawPlayableStemArtifactReference {
    artifact_id: String,
    stem_kind: PlaybackStemKind,
    file_size_bytes: u64,
    content_hash_sha256: String,
    media_type: String,
    sample_rate: u32,
    channel_count: u8,
    sample_count: u64,
    duration_seconds: f64,
}

/// Path-free metadata for one complete and aligned generated source set.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayableStemArtifactSetReference {
    artifact_set_id: String,
    format_version: u8,
    sample_rate: u32,
    channel_count: u8,
    sample_count: u64,
    duration_seconds: f64,
    applied_gain: f64,
    stem_artifacts: Vec<PlayableStemArtifactReference>,
}

impl PlayableStemArtifactSetReference {
    /// Return the lowercase SHA-256 identity used as the fixed directory name.
    pub fn artifact_set_id(&self) -> &str {
        &self.artifact_set_id
    }

    /// Return the artifact contract version.
    pub const fn format_version(&self) -> u8 {
        self.format_version
    }

    /// Return the common sample rate for every source.
    pub const fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Return the common channel count for every source.
    pub const fn channel_count(&self) -> u8 {
        self.channel_count
    }

    /// Return the common sample count for every source.
    pub const fn sample_count(&self) -> u64 {
        self.sample_count
    }

    /// Return the common duration for every source.
    pub const fn duration_seconds(&self) -> f64 {
        self.duration_seconds
    }

    /// Return the set-wide gain applied before PCM16 encoding.
    pub const fn applied_gain(&self) -> f64 {
        self.applied_gain
    }

    /// Return the four canonical artifact references in wire order.
    pub fn stem_artifacts(&self) -> &[PlayableStemArtifactReference] {
        &self.stem_artifacts
    }

    /// Derive the only permitted path for one artifact from a native-owned root.
    pub fn derive_artifact_path(
        &self,
        project_temp_root: &Path,
        stem_kind: PlaybackStemKind,
    ) -> PathBuf {
        project_temp_root
            .join("playable-stems-v1")
            .join(&self.artifact_set_id)
            .join(stem_kind.file_name())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawPlayableStemArtifactSetReference {
    artifact_set_id: String,
    format_version: u8,
    sample_rate: u32,
    channel_count: u8,
    sample_count: u64,
    duration_seconds: f64,
    applied_gain: f64,
    stem_artifacts: Vec<RawPlayableStemArtifactReference>,
}

impl<'de> Deserialize<'de> for PlayableStemArtifactSetReference {
    fn deserialize<ArtifactDeserializer>(
        artifact_deserializer: ArtifactDeserializer,
    ) -> Result<Self, ArtifactDeserializer::Error>
    where
        ArtifactDeserializer: Deserializer<'de>,
    {
        let raw_artifact_set =
            RawPlayableStemArtifactSetReference::deserialize(artifact_deserializer)?;
        validate_sha256_hex(&raw_artifact_set.artifact_set_id, "artifactSetId")
            .map_err(serde::de::Error::custom)?;
        if raw_artifact_set.format_version != PLAYABLE_STEM_ARTIFACT_VERSION {
            return Err(serde::de::Error::custom(
                "unsupported playable stem artifact formatVersion",
            ));
        }
        if !(MIN_PLAYBACK_SAMPLE_RATE_HZ..=MAX_PLAYBACK_SAMPLE_RATE_HZ)
            .contains(&raw_artifact_set.sample_rate)
        {
            return Err(serde::de::Error::custom(
                "playable stem sampleRate is outside the supported range",
            ));
        }
        if raw_artifact_set.channel_count != 1 {
            return Err(serde::de::Error::custom(
                "playable stem channelCount must be one",
            ));
        }
        if raw_artifact_set.sample_count == 0 {
            return Err(serde::de::Error::custom(
                "playable stem sampleCount must be positive",
            ));
        }
        if raw_artifact_set.sample_count > MAX_CLASSIC_RIFF_PCM16_SAMPLE_COUNT {
            return Err(serde::de::Error::custom(
                "playable stem sampleCount exceeds the classic RIFF/WAV limit",
            ));
        }
        let expected_duration =
            raw_artifact_set.sample_count as f64 / raw_artifact_set.sample_rate as f64;
        validate_duration(raw_artifact_set.duration_seconds, expected_duration)
            .map_err(serde::de::Error::custom)?;
        validate_applied_gain(raw_artifact_set.applied_gain)
            .map_err(serde::de::Error::custom)?;
        if raw_artifact_set.stem_artifacts.len() != PlaybackStemKind::canonical_order().len() {
            return Err(serde::de::Error::custom(
                "playable stem artifact set must contain exactly four sources",
            ));
        }

        let expected_file_size = CANONICAL_WAVE_HEADER_BYTES
            + raw_artifact_set.sample_count * PCM16_BYTES_PER_SAMPLE;
        let mut stem_artifacts = Vec::with_capacity(raw_artifact_set.stem_artifacts.len());
        for (raw_artifact, expected_stem_kind) in raw_artifact_set
            .stem_artifacts
            .into_iter()
            .zip(PlaybackStemKind::canonical_order())
        {
            validate_artifact(
                &raw_artifact,
                expected_stem_kind,
                raw_artifact_set.sample_rate,
                raw_artifact_set.channel_count,
                raw_artifact_set.sample_count,
                raw_artifact_set.duration_seconds,
                expected_file_size,
            )
            .map_err(serde::de::Error::custom)?;
            stem_artifacts.push(PlayableStemArtifactReference {
                artifact_id: raw_artifact.artifact_id,
                stem_kind: raw_artifact.stem_kind,
                file_size_bytes: raw_artifact.file_size_bytes,
                content_hash_sha256: raw_artifact.content_hash_sha256,
                media_type: raw_artifact.media_type,
                sample_rate: raw_artifact.sample_rate,
                channel_count: raw_artifact.channel_count,
                sample_count: raw_artifact.sample_count,
                duration_seconds: raw_artifact.duration_seconds,
            });
        }

        Ok(Self {
            artifact_set_id: raw_artifact_set.artifact_set_id,
            format_version: raw_artifact_set.format_version,
            sample_rate: raw_artifact_set.sample_rate,
            channel_count: raw_artifact_set.channel_count,
            sample_count: raw_artifact_set.sample_count,
            duration_seconds: raw_artifact_set.duration_seconds,
            applied_gain: raw_artifact_set.applied_gain,
            stem_artifacts,
        })
    }
}

fn validate_artifact(
    raw_artifact: &RawPlayableStemArtifactReference,
    expected_stem_kind: PlaybackStemKind,
    sample_rate: u32,
    channel_count: u8,
    sample_count: u64,
    duration_seconds: f64,
    expected_file_size: u64,
) -> Result<(), String> {
    if raw_artifact.stem_kind != expected_stem_kind {
        return Err("playable stems must use canonical source order".to_string());
    }
    if raw_artifact.artifact_id != expected_stem_kind.artifact_id() {
        return Err("playable stem artifactId does not match stemKind".to_string());
    }
    validate_sha256_hex(&raw_artifact.content_hash_sha256, "contentHashSha256")?;
    if raw_artifact.media_type != "audio/wav" {
        return Err("playable stem mediaType must be audio/wav".to_string());
    }
    if raw_artifact.sample_rate != sample_rate
        || raw_artifact.channel_count != channel_count
        || raw_artifact.sample_count != sample_count
    {
        return Err("playable stem media metadata is not aligned with its set".to_string());
    }
    validate_duration(raw_artifact.duration_seconds, duration_seconds)?;
    if raw_artifact.file_size_bytes != expected_file_size {
        return Err("playable stem fileSizeBytes does not match canonical PCM16 WAV".to_string());
    }
    Ok(())
}

fn validate_sha256_hex(hash_value: &str, field_name: &str) -> Result<(), String> {
    if hash_value.len() != SHA256_HEX_CHARACTER_COUNT
        || !hash_value.bytes().all(|hex_character| {
            hex_character.is_ascii_digit() || (b'a'..=b'f').contains(&hex_character)
        })
    {
        return Err(format!(
            "playable stem {field_name} must be lowercase SHA-256 hex"
        ));
    }
    Ok(())
}

fn validate_duration(actual_duration: f64, expected_duration: f64) -> Result<(), String> {
    let duration_tolerance =
        expected_duration.abs().max(1.0) * DURATION_RELATIVE_TOLERANCE;
    if !actual_duration.is_finite()
        || actual_duration <= 0.0
        || (actual_duration - expected_duration).abs() > duration_tolerance
    {
        return Err("playable stem durationSeconds is inconsistent".to_string());
    }
    Ok(())
}

fn validate_applied_gain(applied_gain: f64) -> Result<(), String> {
    if !applied_gain.is_finite() || applied_gain <= 0.0 || applied_gain > 1.0 {
        return Err("playable stem appliedGain must be finite and within (0, 1]".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod contract_unit_tests {
    use super::{validate_applied_gain, validate_duration, validate_sha256_hex};

    #[test]
    fn internal_numeric_guards_reject_nonfinite_values() {
        assert!(validate_duration(f64::NAN, 1.0).is_err());
        assert!(validate_duration(f64::INFINITY, 1.0).is_err());
        assert!(validate_applied_gain(f64::NAN).is_err());
        assert!(validate_applied_gain(f64::INFINITY).is_err());
    }

    #[test]
    fn sha256_guard_accepts_numeric_lowercase_hex() {
        assert!(validate_sha256_hex(&"0".repeat(64), "testHash").is_ok());
    }
}
