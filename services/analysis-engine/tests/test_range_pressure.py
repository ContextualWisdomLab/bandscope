"""Tests for vocal range-pressure (tessitura strain) analysis."""

import json
from unittest.mock import patch

import librosa
import numpy as np
import pytest

from bandscope_analysis.ranges.pressure import (
    analyze_range_pressure,
    analyze_range_pressure_from_audio,
)

FRAME_PERIOD = 0.01

DEFAULT_RESULT = {
    "range_semitones": 0,
    "tessitura_center": "",
    "time_in_top_range": 0.0,
    "longest_high_sustain_seconds": 0.0,
    "pressure_level": "low",
}


def _frames_from_midi(midi_values: list[float]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build (f0_hz, voiced_flag, times) arrays from per-frame MIDI pitches.

    A NaN MIDI value marks an unvoiced frame.

    Args:
        midi_values: Per-frame MIDI pitches (NaN for unvoiced frames).

    Returns:
        Arrays suitable for ``analyze_range_pressure``.
    """
    midi = np.asarray(midi_values, dtype=float)
    voiced = ~np.isnan(midi)
    f0 = np.full(midi.shape, np.nan)
    f0[voiced] = librosa.midi_to_hz(midi[voiced])
    times = np.arange(len(midi)) * FRAME_PERIOD
    return f0, voiced, times


def test_high_pressure_part_sits_at_top_of_range() -> None:
    """A part spending ~70% of voiced time in the top 3 semitones is high pressure."""
    # 30% at C4 (midi 60), 70% at G#4 (midi 68); top zone is midi >= 65.
    midi = [60.0] * 3 * 100 + [68.0] * 7 * 100
    f0, voiced, times = _frames_from_midi(midi)

    result = analyze_range_pressure(f0, voiced, times)

    assert result["pressure_level"] == "high"
    assert result["time_in_top_range"] == pytest.approx(0.7)
    assert result["range_semitones"] == 8
    # JSON-serializable contract.
    assert json.loads(json.dumps(result)) == result


def test_low_pressure_comfortable_part() -> None:
    """A wide-range part sitting mostly in the middle is low pressure."""
    # 5% at C5 (midi 72) scattered in short bursts, rest around midi 64-66,
    # bottom at C4 (midi 60). Top zone is midi >= 69: only the C5 frames.
    midi: list[float] = []
    for block in range(20):
        midi += [60.0] * 5 + [64.0] * 30 + [66.0] * 30 + [65.0] * 30
        if block % 4 == 0:
            midi += [72.0] * 4  # brief peaks, far below sustain thresholds
    f0, voiced, times = _frames_from_midi(midi)

    result = analyze_range_pressure(f0, voiced, times)

    assert result["pressure_level"] == "low"
    assert result["time_in_top_range"] < 0.10
    assert result["longest_high_sustain_seconds"] < 2.0
    assert result["range_semitones"] == 12
    assert result["tessitura_center"] == "F4"  # median midi 65


def test_medium_pressure_via_sustained_high_note() -> None:
    """A ~3s sustained high note in an otherwise mid part triggers medium."""
    # 2800 mid frames (midi 62) + 300 consecutive high frames (midi 70).
    # time_in_top_range = 300/3100 < 0.10, sustain ~3s > 2s -> medium.
    midi = [62.0] * 2800 + [70.0] * 300
    f0, voiced, times = _frames_from_midi(midi)

    result = analyze_range_pressure(f0, voiced, times)

    assert result["pressure_level"] == "medium"
    assert result["time_in_top_range"] < 0.10
    assert result["longest_high_sustain_seconds"] == pytest.approx(3.0, abs=0.05)


def test_unvoiced_frames_break_high_sustain_runs() -> None:
    """An unvoiced gap splits a high-zone run into shorter sustains."""
    midi = [62.0] * 100 + [70.0] * 150 + [float("nan")] * 10 + [70.0] * 150
    f0, voiced, times = _frames_from_midi(midi)

    result = analyze_range_pressure(f0, voiced, times)

    assert result["longest_high_sustain_seconds"] == pytest.approx(1.5, abs=0.05)


def test_empty_arrays_return_safe_default() -> None:
    """Empty input arrays yield the neutral default result."""
    empty = np.array([])
    result = analyze_range_pressure(empty, np.array([], dtype=bool), empty)
    assert result == DEFAULT_RESULT


def test_fully_unvoiced_returns_safe_default() -> None:
    """Input with no voiced frames yields the neutral default result."""
    f0, voiced, times = _frames_from_midi([float("nan")] * 50)
    result = analyze_range_pressure(f0, voiced, times)
    assert result == DEFAULT_RESULT


def test_mismatched_shapes_return_safe_default() -> None:
    """Mismatched array shapes are a safe failure, not an exception."""
    f0 = np.array([440.0, 440.0, 440.0])
    voiced = np.array([True, True])
    times = np.array([0.0, 0.01, 0.02])
    assert analyze_range_pressure(f0, voiced, times) == DEFAULT_RESULT


def test_malformed_input_returns_safe_default() -> None:
    """Non-numeric input is a safe failure, not an exception."""
    f0 = np.array(["not", "a", "pitch"])
    voiced = np.array([True, True, True])
    times = np.array([0.0, 0.01, 0.02])
    assert analyze_range_pressure(f0, voiced, times) == DEFAULT_RESULT


def test_single_voiced_frame_has_zero_range() -> None:
    """A single voiced frame yields a zero-span, single-frame-period sustain."""
    f0 = np.array([440.0])
    voiced = np.array([True])
    times = np.array([0.0])

    result = analyze_range_pressure(f0, voiced, times)

    assert result["range_semitones"] == 0
    assert result["tessitura_center"] == "A4"
    assert result["time_in_top_range"] == pytest.approx(1.0)
    assert result["longest_high_sustain_seconds"] == 0.0


def test_from_audio_with_synthesized_tone() -> None:
    """The audio convenience wrapper analyzes a synthesized A4 tone."""
    sr = 22050
    t = np.linspace(0, 1.0, sr)
    audio = np.sin(2 * np.pi * 440.0 * t)

    result = analyze_range_pressure_from_audio(audio, sr=sr)

    assert result["tessitura_center"] == "A4"
    assert result["range_semitones"] <= 1
    assert json.loads(json.dumps(result)) == result


def test_from_audio_empty_returns_safe_default() -> None:
    """Empty audio yields the neutral default result."""
    assert analyze_range_pressure_from_audio(np.array([]), sr=22050) == DEFAULT_RESULT


def test_from_audio_pyin_failure_returns_safe_default() -> None:
    """A pYIN parameter error is a safe failure, not an exception."""
    audio = np.zeros(2048)
    with patch(
        "bandscope_analysis.ranges.pressure.librosa.pyin",
        side_effect=librosa.util.exceptions.ParameterError("boom"),
    ):
        assert analyze_range_pressure_from_audio(audio, sr=22050) == DEFAULT_RESULT
