"""Regression tests for decoder dtype admission at the canonical PCM boundary."""

from __future__ import annotations

import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicyError,
)


@pytest.mark.parametrize(
    "decoder_output",
    [
        np.array([1, -1], dtype=np.int16),
        np.array([True, False], dtype=np.bool_),
        np.array([0.25 + 0.5j, -0.25j], dtype=np.complex64),
    ],
)
def test_decode_mono_audio_rejects_non_floating_decoder_dtype_before_canonicalization(
    monkeypatch: pytest.MonkeyPatch,
    decoder_output: np.ndarray,
) -> None:
    """Reject malformed dtypes before allocating canonical rehearsal PCM."""
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (
            decoder_output,
            DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate,
        ),
    )
    monkeypatch.setattr(
        audio_decode.np,
        "array",
        lambda *_args, **_kwargs: pytest.fail(
            "non-floating decoder output must be rejected before canonical allocation"
        ),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value.reason == "malformed_header"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
    assert str(caught.value) == "Audio input violates the audio resource policy."
