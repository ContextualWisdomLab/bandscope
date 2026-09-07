"""Regression tests for the canonical decoded PCM dtype contract."""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)


def test_canonical_decoded_dtype_contract_is_versioned() -> None:
    """A stricter canonical PCM representation advances policy provenance."""
    assert AUDIO_RESOURCE_POLICY_VERSION == "3"


@pytest.mark.parametrize("dtype", [np.float16, np.float64])
def test_noncanonical_floating_dtype_fails_closed(dtype: type[np.floating]) -> None:
    """Floating buffers cannot bypass the canonical float32 PCM contract."""
    policy = AudioResourcePolicy(
        target_sample_rate=8,
        max_duration_seconds=1.0,
        max_decoded_audio_bytes=64,
    )
    audio = np.zeros(4, dtype=dtype)

    with pytest.raises(AudioResourcePolicyError) as captured:
        policy.validate_decoded_audio(audio, 8)

    assert captured.value.reason == "decoded_dtype_unsupported"
    assert captured.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
