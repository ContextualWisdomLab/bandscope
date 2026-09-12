"""Reproducibility contracts for the canonical local-audio decoder."""

from __future__ import annotations

import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import DEFAULT_AUDIO_RESOURCE_POLICY


def test_decode_mono_audio_pins_canonical_dtype_and_resampler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not let third-party decoder defaults redefine the MIR input signal."""
    source = io.BytesIO(b"container")
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)

    def load(_candidate: object, **kwargs: object) -> tuple[np.ndarray, int]:
        captured_kwargs.update(kwargs)
        return (
            np.array([0.25, -0.5], dtype=np.float32),
            DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate,
        )

    monkeypatch.setattr(audio_decode.librosa, "load", load)

    decoded, sample_rate = audio_decode.decode_mono_audio(source)

    assert captured_kwargs["dtype"] is np.float32
    assert captured_kwargs["res_type"] == "soxr_hq"
    assert captured_kwargs["sr"] == DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate
    assert captured_kwargs["mono"] is True
    assert (
        captured_kwargs["duration"] == DEFAULT_AUDIO_RESOURCE_POLICY.decode_probe_duration_seconds
    )
    np.testing.assert_array_equal(decoded, np.array([0.25, -0.5], dtype=np.float32))
    assert sample_rate == DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate
