"""Tests for the pitch tracking module."""

from unittest.mock import patch

import librosa
import numpy as np

from bandscope_analysis.ranges.pitch_tracker import PitchTracker


def patched_pyin_audio() -> np.ndarray:
    """Return deterministic audio for tests that patch pYIN output."""
    return np.zeros(22050, dtype=np.float32)


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
    y = patched_pyin_audio()

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        side_effect=librosa.util.exceptions.ParameterError("Pyin Error"),
    ):
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
    y = patched_pyin_audio()

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        return_value=(None, np.array([False]), np.array([0.0])),
    ):
        result = tracker.track(y, sr=22050)
        assert result["lowest_note"] is None


def test_pitch_tracker_medium_confidence() -> None:
    """Test that a moderate-quality signal produces medium confidence."""
    tracker = PitchTracker()
    sr = 22050
    y = np.full(sr, 0.01, dtype=np.float32)
    f0 = np.full(10, 440.0)
    voiced_flag = np.array([True, True, True, True, False, False, False, False, False, False])
    voiced_probs = np.full(10, 0.4)

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        return_value=(f0, voiced_flag, voiced_probs),
    ):
        result = tracker.track(y, sr=sr)

    assert result["lowest_note"] == "A4"
    assert result["highest_note"] == "A4"
    assert result["confidence"] == "medium"


def test_pitch_tracker_all_nan_voicing_probs_returns_low() -> None:
    """Test that all-NaN voicing probabilities fail closed."""
    tracker = PitchTracker()
    sr = 22050
    y = np.full(sr, 0.05, dtype=np.float32)
    f0 = np.full(10, 440.0)
    voiced_flag = np.full(10, True)
    voiced_probs = np.full(10, np.nan)

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        return_value=(f0, voiced_flag, voiced_probs),
    ):
        result = tracker.track(y, sr=sr)

    assert result["lowest_note"] is None
    assert result["highest_note"] is None
    assert result["confidence"] == "low"


def test_pitch_tracker_none_voicing_probs_returns_low() -> None:
    """Test that missing voicing probabilities fail closed."""
    tracker = PitchTracker()
    sr = 22050
    y = np.full(sr, 0.05, dtype=np.float32)
    f0 = np.full(10, 440.0)
    voiced_flag = np.full(10, True)

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        return_value=(f0, voiced_flag, None),
    ):
        result = tracker.track(y, sr=sr)

    assert result["lowest_note"] is None
    assert result["highest_note"] is None
    assert result["confidence"] == "low"


def test_pitch_tracker_confidence_multi_factor() -> None:
    """Test that confidence computation uses multiple factors."""
    tracker = PitchTracker()
    sr = 22050
    t = np.linspace(0, 2.0, sr * 2)
    # Strong, sustained sine wave = high voicing + high energy + high ratio
    y = np.sin(2 * np.pi * 440.0 * t)

    result = tracker.track(y, sr=sr)
    assert result["lowest_note"] is not None
    assert result["confidence"] == "high"


def test_pitch_tracker_confidence_none_probs() -> None:
    """Test confidence computation when voiced_probs is None."""
    tracker = PitchTracker()
    # Directly call _compute_confidence with None probs
    voiced_flag = np.array([True, False, True])
    y = np.sin(np.linspace(0, 1, 100))
    result = tracker._compute_confidence(None, voiced_flag, y)
    assert result in ("low", "medium", "high")


def test_pitch_tracker_confidence_returns_medium() -> None:
    """Test that _compute_confidence returns medium for moderate signals."""
    tracker = PitchTracker()
    # Moderate voicing probs, moderate voicing ratio, moderate energy
    voiced_probs = np.array([0.5, 0.6, 0.4, 0.5, 0.3])
    voiced_flag = np.array([True, True, False, True, False])
    # Moderate energy signal
    y = np.sin(np.linspace(0, 6.28, 1000)) * 0.04

    result = tracker._compute_confidence(voiced_probs, voiced_flag, y)
    # score = 0.5*0.46 + 0.3*0.6 + 0.2*(0.04/0.05*~0.028/0.05)
    # This should be in the medium range
    assert result == "medium"


def test_pitch_tracker_confidence_returns_low() -> None:
    """Test that _compute_confidence returns low for very weak signals."""
    tracker = PitchTracker()
    # Low voicing probs, low voicing ratio, very low energy
    voiced_probs = np.array([0.1, 0.2, 0.1, 0.05, 0.1])
    voiced_flag = np.array([False, False, False, False, True])
    # Very low energy signal
    y = np.zeros(1000) + np.random.randn(1000) * 0.001

    result = tracker._compute_confidence(voiced_probs, voiced_flag, y)
    assert result == "low"


def test_pitch_tracker_nan_f0_returns_low() -> None:
    """Test that NaN-only voiced pitch values fail closed."""
    tracker = PitchTracker()
    y = patched_pyin_audio()

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        return_value=(
            np.array([np.nan, np.nan]),
            np.array([True, True]),
            np.array([1.0, 1.0]),
        ),
    ):
        result = tracker.track(y, sr=22050)

    assert result["lowest_note"] is None
    assert result["highest_note"] is None
    assert result["confidence"] == "low"


def test_pitch_tracker_low_average_voicing_probability_returns_low() -> None:
    """Test that very low average voicing probability suppresses note output."""
    tracker = PitchTracker()
    y = patched_pyin_audio()

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        return_value=(np.array([440.0]), np.array([True]), np.array([0.1])),
    ):
        result = tracker.track(y, sr=22050)

    assert result["lowest_note"] is None
    assert result["highest_note"] is None
    assert result["confidence"] == "low"
