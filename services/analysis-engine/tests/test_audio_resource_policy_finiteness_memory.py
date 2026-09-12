"""Regression coverage for bounded decoded-audio finiteness validation."""

from __future__ import annotations

import numpy as np
import pytest

import bandscope_analysis.audio_resource_policy as resource_policy_module
from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    AudioResourcePolicyError,
)


@pytest.mark.parametrize("nonfinite_value", [np.nan, np.inf, -np.inf])
def test_finiteness_scan_caps_temporary_boolean_mask_and_preserves_rejection(
    monkeypatch: pytest.MonkeyPatch,
    nonfinite_value: float,
) -> None:
    """Finiteness validation must not allocate one full-song boolean mask."""
    policy = resource_policy_module.AudioResourcePolicy(
        target_sample_rate=44_100,
        max_duration_seconds=24.0,
    )
    audio = np.zeros(1_048_577, dtype=np.float32)
    audio[-1] = nonfinite_value
    observed_samples: list[int] = []
    original_isfinite = np.isfinite

    def tracking_isfinite(values: np.ndarray) -> np.ndarray:
        observed_samples.append(values.size)
        return original_isfinite(values)

    monkeypatch.setattr(resource_policy_module.np, "isfinite", tracking_isfinite)

    with pytest.raises(AudioResourcePolicyError) as captured:
        policy.validate_decoded_audio(audio, 44_100)

    assert captured.value.reason == "malformed_header"
    assert captured.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
    assert observed_samples
    assert max(observed_samples) * np.dtype(np.bool_).itemsize <= 1024 * 1024
    assert sum(observed_samples) == audio.size
