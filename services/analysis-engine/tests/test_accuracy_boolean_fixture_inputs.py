"""Boolean and derived-arithmetic guards for deterministic real-audio fixtures."""

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


@pytest.mark.parametrize("factory", [render_c_major_triad, render_click_track])
def test_fixture_rejects_nonfinite_scaled_sample_count(factory: Any) -> None:
    """Finite inputs whose product overflows must fail before allocation authority."""
    with pytest.raises(ValueError, match="sample count"):
        factory(duration_seconds=1e308)


@pytest.mark.parametrize("factory", [render_c_major_triad, render_click_track])
def test_fixture_rejects_duration_shorter_than_one_sample(factory: Any) -> None:
    """Positive durations that quantize to zero samples must fail as evidence."""
    sub_sample_duration = np.nextafter(0.0, 1.0)

    with pytest.raises(ValueError, match="sample count"):
        factory(duration_seconds=sub_sample_duration)


def test_click_fixture_rejects_tempo_whose_beat_interval_overflows() -> None:
    """A finite positive tempo must not become infinite loop timing authority."""
    smallest_positive = np.nextafter(0.0, 1.0)

    with pytest.raises(ValueError, match="bpm"):
        render_click_track(bpm=smallest_positive, duration_seconds=1.0)


def test_click_fixture_rejects_tempo_shorter_than_one_sample() -> None:
    """A click cadence faster than one sample must not alias acceptance evidence."""
    with pytest.raises(ValueError, match="beat interval"):
        render_click_track(bpm=6_001.0, duration_seconds=0.02, sample_rate=100)


def test_click_fixture_rejects_sample_rate_too_low_for_one_click_sample() -> None:
    """A click fixture must contain at least one sample of click evidence."""
    with pytest.raises(ValueError, match="click length"):
        render_click_track(bpm=60.0, duration_seconds=0.1, sample_rate=99)


def test_click_fixture_rejects_a_silent_aliased_pulse() -> None:
    """A valid-sized but silent click pulse cannot become tempo evidence."""
    with pytest.raises(ValueError, match="non-zero signal"):
        render_click_track(bpm=60.0, duration_seconds=0.1, sample_rate=100)


def test_wav_writer_rejects_boolean_sample_rate(tmp_path: Path) -> None:
    """A Boolean sample rate must not be serialized as a 1 Hz WAV contract."""
    with pytest.raises(ValueError, match="sample_rate"):
        write_pcm_wav(
            tmp_path / "boolean-rate.wav",
            np.zeros(4, dtype=np.float32),
            cast(Any, True),
        )
