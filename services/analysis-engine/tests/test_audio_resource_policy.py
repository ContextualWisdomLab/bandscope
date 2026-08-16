"""Tests for the canonical local-audio resource policy."""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    AudioResourcePolicy,
    DEFAULT_AUDIO_RESOURCE_POLICY,
)


def test_default_policy_has_stable_version_and_rehearsal_budget() -> None:
    """The default policy exposes one versioned budget shared by analyzers."""
    assert AUDIO_RESOURCE_POLICY_VERSION == "1"
    assert DEFAULT_AUDIO_RESOURCE_POLICY.max_encoded_file_bytes == 100 * 1024 * 1024
    assert DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate == 44_100
    assert DEFAULT_AUDIO_RESOURCE_POLICY.max_duration_seconds == 15 * 60
    assert DEFAULT_AUDIO_RESOURCE_POLICY.max_decoded_samples == 44_100 * 15 * 60


@pytest.mark.parametrize("file_size", [True, -1, 0, 101])
def test_encoded_file_size_fails_closed_outside_policy(file_size: object) -> None:
    """Invalid, empty, or oversized encoded inputs are rejected before decode."""
    policy = AudioResourcePolicy(max_encoded_file_bytes=100)

    with pytest.raises(ValueError, match="audio resource policy"):
        policy.validate_encoded_file_bytes(file_size)


def test_encoded_file_size_accepts_exact_boundary() -> None:
    """A non-empty encoded file exactly at the configured ceiling is accepted."""
    policy = AudioResourcePolicy(max_encoded_file_bytes=100)

    assert policy.validate_encoded_file_bytes(100) == 100


@pytest.mark.parametrize(
    ("audio", "sample_rate"),
    [
        (np.zeros(8_001, dtype=np.float32), 8_000),
        (np.zeros((2, 4_000), dtype=np.float32), 8_000),
        (np.array([0.0, np.nan], dtype=np.float32), 8_000),
        (np.array(["not-a-sample"], dtype=object), 8_000),
        (np.zeros(10, dtype=np.int16), 8_000),
        (np.zeros(10, dtype=np.float32), 0),
        (np.zeros(10, dtype=np.float32), True),
    ],
)
def test_decoded_audio_fails_closed_outside_policy(
    audio: np.ndarray,
    sample_rate: object,
) -> None:
    """Decoded output is revalidated for type, shape, finiteness, rate, and sample budget."""
    policy = AudioResourcePolicy(target_sample_rate=8_000, max_duration_seconds=1.0)

    with pytest.raises(ValueError, match="audio resource policy"):
        policy.validate_decoded_audio(audio, sample_rate)


def test_decoded_audio_accepts_exact_sample_boundary() -> None:
    """A finite mono artifact exactly at the decoded-sample ceiling is accepted."""
    policy = AudioResourcePolicy(target_sample_rate=8_000, max_duration_seconds=1.0)
    audio = np.zeros(8_000, dtype=np.float32)

    validated = policy.validate_decoded_audio(audio, 8_000)

    assert validated is audio


@pytest.mark.parametrize(
    "kwargs",
    [
        {"max_encoded_file_bytes": 0},
        {"target_sample_rate": 0},
        {"max_duration_seconds": 0.0},
        {"max_duration_seconds": float("inf")},
    ],
)
def test_policy_configuration_itself_fails_closed(kwargs: dict[str, object]) -> None:
    """Invalid policy construction cannot silently create an unbounded budget."""
    with pytest.raises(ValueError, match="audio resource policy"):
        AudioResourcePolicy(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"target_sample_rate": 10**400, "max_duration_seconds": 1.0},
        {"target_sample_rate": 1, "max_duration_seconds": 10**400},
        {"max_encoded_file_bytes": 10**400},
    ],
)
def test_policy_configuration_fails_closed_on_unrepresentable_limits(
    kwargs: dict[str, object],
) -> None:
    """Extreme integer limits cannot escape stable policy validation through overflow."""
    with pytest.raises(ValueError, match="audio resource policy"):
        AudioResourcePolicy(**kwargs)  # type: ignore[arg-type]
