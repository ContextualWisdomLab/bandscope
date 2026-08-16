"""Boolean evidence guards for deterministic real-audio fixtures."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import numpy as np
import pytest

from bandscope_analysis.accuracy import render_c_major_triad, render_click_track, write_pcm_wav


@pytest.mark.parametrize(
    ("keyword", "value", "message"),
    [
        ("duration_seconds", True, "duration_seconds"),
        ("sample_rate", True, "sample_rate"),
    ],
)
def test_c_major_fixture_rejects_boolean_numeric_evidence(
    keyword: str,
    value: bool,
    message: str,
) -> None:
    """Boolean duration/rate values must not become numeric fixture authority."""
    kwargs = {keyword: cast(Any, value)}
    with pytest.raises(ValueError, match=message):
        render_c_major_triad(**kwargs)


@pytest.mark.parametrize(
    ("keyword", "value", "message"),
    [
        ("bpm", True, "bpm"),
        ("duration_seconds", True, "duration_seconds"),
        ("sample_rate", True, "sample_rate"),
    ],
)
def test_click_fixture_rejects_boolean_numeric_evidence(
    keyword: str,
    value: bool,
    message: str,
) -> None:
    """Boolean tempo/duration/rate values must fail before allocation or loops."""
    kwargs = {keyword: cast(Any, value)}
    with pytest.raises(ValueError, match=message):
        render_click_track(**kwargs)


def test_wav_writer_rejects_boolean_sample_rate(tmp_path: Path) -> None:
    """A Boolean sample rate must not be serialized as a 1 Hz WAV contract."""
    with pytest.raises(ValueError, match="sample_rate"):
        write_pcm_wav(
            tmp_path / "boolean-rate.wav",
            np.zeros(4, dtype=np.float32),
            cast(Any, True),
        )
