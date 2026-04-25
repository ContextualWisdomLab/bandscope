"""Tests for the pitch tracking module."""

from unittest.mock import patch

import librosa
import numpy as np

from bandscope_analysis.ranges.pitch_tracker import PitchTracker


def test_pitch_tracker_empty_audio() -> None:
    """Test pitch tracking with empty audio array."""
    tracker = PitchTracker()
    result = tracker.track(np.array([]), sr=22050)
    assert result["lowest_note"] is None
    assert result["highest_note"] is None
    assert result["confidence"] == "low"


def test_pitch_tracker_unvoiced_audio() -> None:
    """Test pitch tracking with noise (unvoiced)."""
    tracker = PitchTracker()
    # Create random noise
    y = np.random.randn(22050) * 0.1
    result = tracker.track(y, sr=22050)
    assert result["lowest_note"] is None
    assert result["highest_note"] is None
    assert result["confidence"] == "low"


def test_pitch_tracker_sine_wave() -> None:
    """Test pitch tracking with a clear sine wave (A4 = 440Hz)."""
    tracker = PitchTracker()
    sr = 22050
    t = np.linspace(0, 1.0, sr)
    y = np.sin(2 * np.pi * 440.0 * t)

    result = tracker.track(y, sr=sr)
    assert result["lowest_note"] == "A4"
    assert result["highest_note"] == "A4"
    assert result["confidence"] == "high"


def test_pitch_tracker_bass_note() -> None:
    """Test pitch tracking with a low sine wave (E2 = ~82.4Hz)."""
    tracker = PitchTracker()
    sr = 22050
    t = np.linspace(0, 1.0, sr)
    y = np.sin(2 * np.pi * 82.4069 * t)

    result = tracker.track(y, sr=sr)
    assert result["lowest_note"] == "E2"
    assert result["highest_note"] == "E2"
    assert result["confidence"] == "high"


def test_pitch_tracker_sweep() -> None:
    """Test pitch tracking with a frequency sweep (C4 to G4)."""
    tracker = PitchTracker()
    sr = 22050
    t = np.linspace(0, 2.0, sr * 2)
    # C4 is ~261.63Hz, G4 is ~392.00Hz
    # Simple chirp
    f0 = 261.63
    f1 = 392.00
    phase = 2 * np.pi * (f0 * t + 0.5 * (f1 - f0) / 2.0 * t**2)
    y = np.sin(phase)

    result = tracker.track(y, sr=sr)
    # The actual extracted range might have slight artifacts, but should be bounded
    # around C4 and G4.
    assert result["lowest_note"] in ("C4", "C#4", "B3")
    assert result["highest_note"] in ("G4", "F#4", "G#4")


def test_pitch_tracker_pyin_exception():
    """Test fallback when pyin raises ParameterError."""
    tracker = PitchTracker()
    y = np.random.randn(22050)

    with patch("librosa.pyin", side_effect=librosa.util.exceptions.ParameterError("Pyin Error")):
        result = tracker.track(y, sr=22050)
        assert result["lowest_note"] is None
        assert result["highest_note"] is None


def test_pitch_tracker_few_frames():
    """Test percentile fallback when only a few voiced frames exist."""
    tracker = PitchTracker()
    sr = 22050
    t = np.linspace(
        0, 0.1, int(sr * 0.1)
    )  # 0.1 seconds ~ 2205 samples, hop length 512 => ~4 frames
    y = np.sin(2 * np.pi * 440.0 * t)

    result = tracker.track(y, sr=sr)
    # Should hit len(voiced_f0) < 10 branch
    assert result["lowest_note"] is not None


def test_pitch_tracker_none_f0():
    """Test when pyin returns None for pitch array."""
    tracker = PitchTracker()
    y = np.random.randn(22050)

    with patch("librosa.pyin", return_value=(None, np.array([False]), np.array([0.0]))):
        result = tracker.track(y, sr=22050)
        assert result["lowest_note"] is None
