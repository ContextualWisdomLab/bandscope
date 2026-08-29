"""Fail-closed decoded-PCM evidence contract for accuracy acceptance."""

from __future__ import annotations

from typing import Any, cast

import numpy as np
import pytest

from bandscope_analysis.accuracy import evaluate_c_major_pcm, render_c_major_triad


@pytest.mark.parametrize("sample_rate", [True, "22050", 0, -1, float("nan"), float("inf")])
def test_c_major_pcm_rejects_invalid_sample_rate(sample_rate: object) -> None:
    """Invalid rate evidence must fail before production recognition or division."""
    audio = render_c_major_triad(duration_seconds=0.25)

    with pytest.raises(ValueError, match="sample_rate"):
        evaluate_c_major_pcm(audio, cast(Any, sample_rate), "a" * 64)


def test_c_major_pcm_rejects_non_mono_audio() -> None:
    """Accuracy acceptance must not reinterpret multichannel arrays as mono PCM."""
    stereo = np.zeros((32, 2), dtype=np.float32)

    with pytest.raises(ValueError, match="audio"):
        evaluate_c_major_pcm(stereo, 22_050, "a" * 64)


@pytest.mark.parametrize(
    "audio",
    [
        np.zeros(0, dtype=np.float32),
        np.array([0.0, np.nan], dtype=np.float32),
        np.array([0.0, np.inf], dtype=np.float32),
        np.zeros(32, dtype=np.int16),
    ],
)
def test_c_major_pcm_rejects_malformed_decoded_audio(audio: np.ndarray) -> None:
    """Empty, non-finite, or non-floating decoded evidence must fail closed."""
    with pytest.raises(ValueError, match="audio"):
        evaluate_c_major_pcm(audio, 22_050, "a" * 64)
