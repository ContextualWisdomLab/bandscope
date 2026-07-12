"""Tests for swing vs straight groove/feel detection."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from bandscope_analysis.temporal import detect_groove
from bandscope_analysis.temporal.groove import _swing_ratio

SR = 22050


def _click(sr: int = SR, duration: float = 0.01, freq: float = 2000.0) -> NDArray[np.float64]:
    """Build a short windowed sine burst used as a percussive onset."""
    n = int(sr * duration)
    t = np.arange(n) / sr
    burst: NDArray[np.float64] = np.sin(2.0 * np.pi * freq * t) * np.hanning(n)
    return burst


def _build_track(
    beat_interval: float,
    n_beats: int,
    offset_fraction: float,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Synthesize a click track with an off-beat onset at a known fraction.

    Args:
        beat_interval: Seconds between beats.
        n_beats: Number of beats to place.
        offset_fraction: Position of the off-beat onset within each interval.

    Returns:
        The mono audio and the array of beat times.
    """
    total = beat_interval * (n_beats + 1)
    audio: NDArray[np.float64] = np.zeros(int(SR * total), dtype=np.float64)
    burst = _click()
    beats: list[float] = []
    for i in range(n_beats):
        beat_time = i * beat_interval
        beats.append(beat_time)
        start = int(beat_time * SR)
        audio[start : start + len(burst)] += burst
        off_time = beat_time + offset_fraction * beat_interval
        off_start = int(off_time * SR)
        audio[off_start : off_start + len(burst)] += burst
    return audio, np.asarray(beats, dtype=np.float64)


def test_straight_feel_detected() -> None:
    """Onsets exactly halfway between beats read as a straight feel."""
    audio, beats = _build_track(beat_interval=1.0, n_beats=12, offset_fraction=0.5)
    result = detect_groove(audio, SR, beats)

    assert result["feel"] == "straight"
    assert result["swing_ratio"] == pytest.approx(1.0, abs=0.35)
    assert result["confidence"] > 0.5


def test_swing_feel_detected() -> None:
    """Onsets two-thirds of the way between beats read as a swing feel."""
    audio, beats = _build_track(beat_interval=1.0, n_beats=12, offset_fraction=2.0 / 3.0)
    result = detect_groove(audio, SR, beats)

    assert result["feel"] == "swing"
    assert result["swing_ratio"] == pytest.approx(2.0, abs=0.5)
    assert result["confidence"] > 0.5


def test_fewer_than_three_beats_returns_safe_default() -> None:
    """Two beats cannot define a groove and must yield the safe default."""
    result = detect_groove(np.ones(SR, dtype=np.float64), SR, [0.0, 0.5])

    assert result == {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def test_empty_audio_returns_safe_default() -> None:
    """Empty audio yields the safe default with zero confidence."""
    result = detect_groove(np.asarray([], dtype=np.float64), SR, [0.0, 0.5, 1.0])

    assert result == {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def test_zero_length_intervals_return_safe_default() -> None:
    """Identical (non-increasing) beat times leave no interval to analyze."""
    result = detect_groove(np.ones(SR, dtype=np.float64), SR, [1.0, 1.0, 1.0])

    assert result == {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def test_silence_yields_no_offbeat_onsets() -> None:
    """Silent audio has no onset peaks, so no off-beat position is measured."""
    result = detect_groove(np.zeros(SR * 3, dtype=np.float64), SR, [0.0, 0.5, 1.0, 1.5, 2.0])

    assert result == {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def test_beats_beyond_audio_have_no_frames() -> None:
    """Beats spanning past the audio leave every search window empty."""
    short_audio = np.ones(int(SR * 0.1), dtype=np.float64)
    result = detect_groove(short_audio, SR, [0.0, 1.0, 2.0])

    assert result == {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def test_internal_error_returns_safe_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Any unexpected error inside detection is swallowed into the safe default."""

    def _boom(*_args: Any, **_kwargs: Any) -> NDArray[np.float64]:
        raise RuntimeError("onset failure")

    monkeypatch.setattr("bandscope_analysis.temporal.groove.librosa.onset.onset_strength", _boom)
    result = detect_groove(np.ones(SR, dtype=np.float64), SR, [0.0, 0.5, 1.0])

    assert result == {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def test_swing_ratio_clamps_at_beat_boundary() -> None:
    """A position at or beyond the beat boundary clamps instead of dividing by zero."""
    assert _swing_ratio(1.0) == pytest.approx(1e6)
    assert _swing_ratio(1.5) == pytest.approx(1e6)
    assert _swing_ratio(0.5) == pytest.approx(1.0)
