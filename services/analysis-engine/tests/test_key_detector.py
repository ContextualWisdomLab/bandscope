"""Tests for the Krumhansl-Schmuckler key detector."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.chords.key_detector import (
    KeyDetector,
    _empty_result,
    _pearson,
)

SAMPLE_RATE = 22050

# Concert-pitch fundamental frequencies (fourth octave) by note name.
_NOTE_FREQS = {
    "C": 261.63,
    "C#": 277.18,
    "D": 293.66,
    "D#": 311.13,
    "E": 329.63,
    "F": 349.23,
    "F#": 369.99,
    "G": 392.00,
    "G#": 415.30,
    "A": 440.00,
    "A#": 466.16,
    "B": 493.88,
}


def _tone(freq: float, duration: float, sr: int = SAMPLE_RATE, amp: float = 1.0) -> np.ndarray:
    """Synthesize a single sine tone of the given frequency and duration."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)


def _scale(notes: list[tuple[str, float]], sr: int = SAMPLE_RATE) -> np.ndarray:
    """Synthesize a melody from (note name, duration) pairs concatenated in time."""
    return np.concatenate([_tone(_NOTE_FREQS[name], dur, sr) for name, dur in notes])


def test_detect_c_major_scale() -> None:
    """A C-major scale is detected as C major."""
    notes = [
        ("C", 0.6),
        ("D", 0.3),
        ("E", 0.3),
        ("F", 0.3),
        ("G", 0.3),
        ("A", 0.3),
        ("B", 0.3),
        ("C", 0.6),
    ]
    result = KeyDetector().detect(_scale(notes), SAMPLE_RATE)
    assert result["tonic"] == "C"
    assert result["mode"] == "major"
    assert result["key"] == "C major"
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["confidence"] > 0.0


def test_detect_a_minor_scale() -> None:
    """An A-minor scale with an emphasized tonic is detected in the minor mode on A."""
    notes = [
        ("A", 0.9),
        ("B", 0.3),
        ("C", 0.3),
        ("D", 0.3),
        ("E", 0.6),
        ("F", 0.3),
        ("G", 0.3),
        ("A", 0.9),
    ]
    result = KeyDetector().detect(_scale(notes), SAMPLE_RATE)
    assert result["mode"] == "minor"
    assert result["tonic"] == "A"
    assert result["key"] == "A minor"
    assert 0.0 <= result["confidence"] <= 1.0


def test_detect_empty_audio() -> None:
    """Empty audio returns the empty result with zero confidence."""
    result = KeyDetector().detect(np.array([], dtype=np.float64), SAMPLE_RATE)
    assert result == {"key": "", "tonic": "", "mode": "", "confidence": 0.0}


def test_detect_chroma_cqt_exception() -> None:
    """A failure inside chroma_cqt yields the empty result and never raises."""
    audio = _tone(_NOTE_FREQS["C"], 1.0)
    with patch("librosa.feature.chroma_cqt", side_effect=RuntimeError("boom")):
        result = KeyDetector().detect(audio, SAMPLE_RATE)
    assert result == _empty_result()


def test_detect_empty_chroma() -> None:
    """An empty chromagram yields the empty result."""
    audio = _tone(_NOTE_FREQS["C"], 1.0)
    with patch("librosa.feature.chroma_cqt", return_value=np.empty((12, 0))):
        result = KeyDetector().detect(audio, SAMPLE_RATE)
    assert result == _empty_result()


def test_detect_all_zero_chroma() -> None:
    """An all-zero (degenerate) chromagram yields the empty result."""
    audio = _tone(_NOTE_FREQS["C"], 1.0)
    with patch("librosa.feature.chroma_cqt", return_value=np.zeros((12, 4))):
        result = KeyDetector().detect(audio, SAMPLE_RATE)
    assert result == _empty_result()


def test_pearson_zero_variance() -> None:
    """Pearson correlation of a constant vector is defined as zero."""
    constant = np.ones(12)
    varying = np.arange(12, dtype=np.float64)
    assert _pearson(constant, varying) == 0.0


def test_pearson_perfect_correlation() -> None:
    """Pearson correlation of identical varying vectors is 1.0."""
    varying = np.arange(12, dtype=np.float64)
    assert _pearson(varying, varying) == 1.0
