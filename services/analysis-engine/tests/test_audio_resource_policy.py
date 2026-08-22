"""Canonical audio-resource policy regressions."""

from __future__ import annotations

import math

import numpy as np
import pytest

from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    DEFAULT_AUDIO_RESOURCE_POLICY,
    MAX_DECODED_SAMPLE_COUNT,
    MAX_DURATION_SECONDS,
    MAX_ENCODED_FILE_BYTES,
    TARGET_SAMPLING_RATE_HZ,
    AudioResourcePolicy,
    AudioResourcePolicyError,
    _checked_int_product,
    estimate_decoded_memory_bytes,
    policy_rejection_message,
    validate_channel_count,
    validate_decoded_audio,
    validate_duration_seconds,
    validate_encoded_file_bytes,
    validate_source_sampling_rate,
)


def _policy_error(reason: str) -> pytest.RaisesContext[AudioResourcePolicyError]:
    """Expect a payload-free rejection for one stable reason code."""
    return pytest.raises(AudioResourcePolicyError, match=policy_rejection_message(reason))


def test_policy_snapshot_is_versioned_and_matches_rehearsal_intake_evidence() -> None:
    """The canonical policy is 15 minutes / 100 MiB / 44.1 kHz, not a 5-minute invention."""
    policy = DEFAULT_AUDIO_RESOURCE_POLICY
    assert policy.version == AUDIO_RESOURCE_POLICY_VERSION == 1
    assert policy.max_encoded_file_bytes == MAX_ENCODED_FILE_BYTES == 100 * 1024 * 1024
    assert policy.max_duration_seconds == MAX_DURATION_SECONDS == 15 * 60
    assert policy.target_sampling_rate_hz == TARGET_SAMPLING_RATE_HZ == 44100
    assert policy.max_decoded_sample_count == MAX_DECODED_SAMPLE_COUNT == 15 * 60 * 44100
    assert policy.max_decoded_memory_bytes == 15 * 60 * 44100 * 2 * 4


@pytest.mark.parametrize("file_size", [1, MAX_ENCODED_FILE_BYTES])
def test_encoded_file_bytes_accept_the_inclusive_ceiling(file_size: int) -> None:
    """Sizes at and below the encoded-byte ceiling are admitted."""
    validate_encoded_file_bytes(file_size)


@pytest.mark.parametrize(
    "file_size",
    [MAX_ENCODED_FILE_BYTES + 1, float(MAX_ENCODED_FILE_BYTES) + 1.0],
)
def test_encoded_file_bytes_reject_the_next_byte(file_size: float) -> None:
    """One byte above the ceiling fails before decode."""
    with _policy_error("encoded_file_too_large"):
        validate_encoded_file_bytes(file_size)


def test_encoded_file_bytes_reject_empty_payloads() -> None:
    """Zero-byte files cannot skip decode-time measurement."""
    with _policy_error("malformed_header"):
        validate_encoded_file_bytes(0)


@pytest.mark.parametrize(
    "file_size",
    [-1, 1.5, math.nan, math.inf, -math.inf, True, "12", None],
)
def test_encoded_file_bytes_reject_malformed_sizes(file_size: object) -> None:
    """Boolean, fractional, non-finite, and non-numeric sizes fail closed."""
    with _policy_error("non_finite_metadata"):
        validate_encoded_file_bytes(file_size)


@pytest.mark.parametrize(
    "duration",
    [DEFAULT_AUDIO_RESOURCE_POLICY.min_duration_seconds, 1.0, MAX_DURATION_SECONDS],
)
def test_duration_accepts_the_inclusive_window(duration: float) -> None:
    """Durations on both published bounds remain valid rehearsal recordings."""
    validate_duration_seconds(duration)


@pytest.mark.parametrize(
    ("duration", "reason"),
    [
        (0.0, "duration_too_short"),
        (DEFAULT_AUDIO_RESOURCE_POLICY.min_duration_seconds - 1e-9, "duration_too_short"),
        (MAX_DURATION_SECONDS + 1e-6, "duration_exceeded"),
        (16 * 60, "duration_exceeded"),
    ],
)
def test_duration_rejects_values_outside_the_window(duration: float, reason: str) -> None:
    """Too-short and too-long recordings name the next file-selection action."""
    with _policy_error(reason):
        validate_duration_seconds(duration)


@pytest.mark.parametrize("rate", [8_000, 44_100, 48_000, 192_000])
def test_source_sampling_rate_accepts_supported_hosts(rate: int) -> None:
    """Common rehearsal capture rates stay inside the policy."""
    validate_source_sampling_rate(rate)


@pytest.mark.parametrize("rate", [0, -1, 7_999, 192_001, 44_100.5])
def test_source_sampling_rate_rejects_unsupported_hosts(rate: object) -> None:
    """Extreme and fractional rates fail before allocation."""
    with _policy_error("sampling_rate_unsupported"):
        validate_source_sampling_rate(rate)


@pytest.mark.parametrize("rate", [math.nan, True, None])
def test_source_sampling_rate_rejects_malformed_metadata(rate: object) -> None:
    """Non-numeric sampling-rate metadata cannot skip the finite-number check."""
    with _policy_error("non_finite_metadata"):
        validate_source_sampling_rate(rate)


@pytest.mark.parametrize("channels", [1, 2])
def test_channel_count_accepts_mono_and_stereo(channels: int) -> None:
    """Mono and stereo remain the only admitted layouts."""
    validate_channel_count(channels)


@pytest.mark.parametrize("channels", [0, 3, 8, 1.5])
def test_channel_count_rejects_unsupported_layouts(channels: object) -> None:
    """Multichannel and fractional layouts fail closed."""
    with _policy_error("channel_count_unsupported"):
        validate_channel_count(channels)


@pytest.mark.parametrize("channels", [math.nan, True, None])
def test_channel_count_rejects_malformed_metadata(channels: object) -> None:
    """Non-numeric channel metadata cannot skip the finite-number check."""
    with _policy_error("non_finite_metadata"):
        validate_channel_count(channels)


def test_decoded_mono_audio_at_the_sample_ceiling_is_admitted() -> None:
    """A decoded buffer exactly at the sample ceiling still validates."""
    policy = AudioResourcePolicy(
        **{
            **DEFAULT_AUDIO_RESOURCE_POLICY.__dict__,
            "max_decoded_sample_count": 8,
            "max_duration_seconds": 8 / 8_000,
            "min_duration_seconds": 8 / 8_000,
        }
    )
    audio = np.zeros(8, dtype=np.float32)
    validate_decoded_audio(audio, 8_000, policy)


def test_decoded_audio_rejects_empty_or_non_array_payloads() -> None:
    """Missing samples cannot skip the decoded-size revalidation."""
    with _policy_error("duration_too_short"):
        validate_decoded_audio(np.zeros(0, dtype=np.float32), 44_100)
    with _policy_error("malformed_header"):
        validate_decoded_audio([0.0], 44_100)
    with _policy_error("malformed_header"):
        validate_decoded_audio(np.array(["x"], dtype=object), 44_100)


def test_decoded_audio_rejects_non_finite_samples() -> None:
    """NaN/Inf PCM cannot proceed into analyzers."""
    audio = np.array([0.0, math.nan], dtype=np.float32)
    with _policy_error("malformed_header"):
        validate_decoded_audio(audio, 44_100)


def test_decoded_audio_rejects_sample_count_above_the_ceiling() -> None:
    """Decoded growth after metadata inspection still fails closed."""
    policy = AudioResourcePolicy(
        **{
            **DEFAULT_AUDIO_RESOURCE_POLICY.__dict__,
            "max_decoded_sample_count": 4,
            "max_duration_seconds": 1.0,
        }
    )
    with _policy_error("decoded_sample_count_exceeded"):
        validate_decoded_audio(np.zeros(5, dtype=np.float32), 8_000, policy)


def test_decoded_audio_rejects_duration_after_sample_count_passes() -> None:
    """Wall-clock duration is rechecked even when the sample ceiling still fits."""
    policy = AudioResourcePolicy(
        **{
            **DEFAULT_AUDIO_RESOURCE_POLICY.__dict__,
            "max_decoded_sample_count": 20_000,
            "max_duration_seconds": 1.0,
        }
    )
    with _policy_error("duration_exceeded"):
        validate_decoded_audio(np.zeros(9_000, dtype=np.float32), 8_000, policy)


def test_decoded_audio_rejects_memory_budget_after_layout_classification() -> None:
    """Stereo expansion can exceed the float32 memory budget without exceeding samples."""
    policy = AudioResourcePolicy(
        **{
            **DEFAULT_AUDIO_RESOURCE_POLICY.__dict__,
            "max_decoded_sample_count": 800,
            "min_duration_seconds": 0.05,
            "max_duration_seconds": 1.0,
            "max_decoded_memory_bytes": 400 * 4,
        }
    )
    with _policy_error("memory_budget_exceeded"):
        validate_decoded_audio(np.zeros((2, 400), dtype=np.float32), 8_000, policy)


def test_decoded_stereo_uses_channel_first_layout() -> None:
    """Librosa-style ``(channels, samples)`` arrays are classified as stereo."""
    audio = np.zeros((2, 8_000), dtype=np.float32)
    validate_decoded_audio(audio, 8_000)


def test_decoded_sample_first_layout_is_still_classified() -> None:
    """A ``(samples, channels)`` buffer with more frames than channels remains stereo."""
    audio = np.zeros((8_000, 2), dtype=np.float32)
    validate_decoded_audio(audio, 8_000)


def test_decoded_audio_rejects_rank_three_buffers() -> None:
    """Unexpected tensor rank is a malformed header, not a new layout."""
    with _policy_error("malformed_header"):
        validate_decoded_audio(np.zeros((1, 1, 8), dtype=np.float32), 8_000)


def test_decoded_audio_rejects_quad_channel_layout() -> None:
    """A four-channel buffer is outside the mono/stereo rehearsal policy."""
    with _policy_error("channel_count_unsupported"):
        validate_decoded_audio(np.zeros((4, 8_000), dtype=np.float32), 8_000)


def test_memory_estimate_uses_checked_arithmetic() -> None:
    """The float32 memory estimate is the checked product of samples, channels, and width."""
    assert estimate_decoded_memory_bytes(10, 2) == 10 * 2 * 4
    with _policy_error("integer_overflow"):
        estimate_decoded_memory_bytes(-1, 2)
    with _policy_error("integer_overflow"):
        _checked_int_product(2**62, 4)


def test_unknown_reason_codes_fail_closed() -> None:
    """Callers cannot invent a reason that skips the payload-free catalog."""
    with _policy_error("malformed_header"):
        policy_rejection_message("not-a-real-reason")


def test_policy_error_carries_versioned_provenance() -> None:
    """Audit metadata records the policy version and reason without payload details."""
    with pytest.raises(AudioResourcePolicyError) as error:
        validate_duration_seconds(16 * 60)
    assert error.value.reason == "duration_exceeded"
    assert error.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
    assert "16" not in error.value.message
    assert "960" not in error.value.message
