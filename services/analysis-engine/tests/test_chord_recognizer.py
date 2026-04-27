"""Tests for the chord recognizer module."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def test_chord_recognizer_empty_audio() -> None:
    """Test chord recognition with empty audio array."""
    recognizer = ChordRecognizer()
    result = recognizer.recognize(np.array([]), sr=22050)
    assert result == []


def test_chord_recognizer_unvoiced_audio() -> None:
    """Test chord recognition with noise."""
    recognizer = ChordRecognizer()
    # Create random noise
    np.random.seed(42)
    y = np.random.randn(22050 * 3) * 0.1
    result = recognizer.recognize(y, sr=22050)
    print("RESULT:", result)
    # Could be N (No chord) or empty
    assert all(chord["chord"] in ("N", "Unknown", "") for chord in result) if result else True


def test_chord_recognizer_c_major_chord() -> None:
    """Test chord recognition with a clear C major chord."""
    recognizer = ChordRecognizer()
    sr = 22050
    t = np.linspace(0, 3.0, sr * 3)
    # C major: C4 (261.63Hz), E4 (329.63Hz), G4 (392.00Hz)
    y = (
        np.sin(2 * np.pi * 261.63 * t)
        + np.sin(2 * np.pi * 329.63 * t)
        + np.sin(2 * np.pi * 392.00 * t)
    ) / 3.0

    result = recognizer.recognize(y, sr=sr)
    assert len(result) > 0
    # At least some of the identified segments should be "C" or "C:maj"
    identified_chords = [r["chord"] for r in result]
    assert "C" in identified_chords or "C:maj" in identified_chords




def test_chord_recognizer_hpss_exception():
    """Test for test_chord_recognizer_hpss_exception."""
    recognizer = ChordRecognizer()
    y = np.random.randn(22050 * 3)
    
    with patch("librosa.effects.hpss", side_effect=Exception("HPSS Error")):
        chords = recognizer.recognize(y, sr=22050)
        assert isinstance(chords, list)

def test_chord_recognizer_chroma_cqt_exception():
    """Test for test_chord_recognizer_chroma_cqt_exception."""
    recognizer = ChordRecognizer()
    y = np.random.randn(22050 * 3)
    
    with patch("librosa.feature.chroma_cqt", side_effect=Exception("CQT Error")):
        chords = recognizer.recognize(y, sr=22050)
        assert chords == []

def test_chord_recognizer_rms_exception():
    """Test for test_chord_recognizer_rms_exception."""
    recognizer = ChordRecognizer()
    y = np.random.randn(22050 * 3)
    
    with patch("librosa.feature.rms", side_effect=Exception("RMS Error")):
        chords = recognizer.recognize(y, sr=22050)
        assert isinstance(chords, list)

def test_chord_recognizer_rms_padding():
    """Test for test_chord_recognizer_rms_padding."""
    recognizer = ChordRecognizer()
    y = np.random.randn(22050 * 3)
    
    # Mock RMS to return something shorter than chromagram
    def mock_rms(*args, **kwargs):
        return np.array([[0.1, 0.1]])
        
    with patch("librosa.feature.rms", side_effect=mock_rms):
        chords = recognizer.recognize(y, sr=22050)
        assert isinstance(chords, list)
        
def test_chord_recognizer_empty_chromagram():
    """Test for test_chord_recognizer_empty_chromagram."""
    recognizer = ChordRecognizer()
    y = np.random.randn(22050 * 3)
    
    # Mock chroma_cqt to return empty array
    with patch("librosa.feature.chroma_cqt", return_value=np.array([])):
        chords = recognizer.recognize(y, sr=22050)
        assert chords == []

def test_chord_recognizer_rms_longer():
    """Test for test_chord_recognizer_rms_longer."""
    recognizer = ChordRecognizer()
    y = np.random.randn(22050 * 3)
    
    # Mock RMS to return something longer than chromagram
    def mock_rms(*args, **kwargs):
        # Return a very long array
        return np.array([np.ones(1000)])
        
    with patch("librosa.feature.rms", side_effect=mock_rms):
        chords = recognizer.recognize(y, sr=22050)
        assert isinstance(chords, list)

def test_chord_recognizer_changing_chords():
    """Test for test_chord_recognizer_changing_chords."""
    recognizer = ChordRecognizer()
    sr = 22050
    t1 = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
    # C major
    y1 = (
        np.sin(2 * np.pi * 261.63 * t1)
        + np.sin(2 * np.pi * 329.63 * t1)
        + np.sin(2 * np.pi * 392.00 * t1)
    ) / 3.0
    
    t2 = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
    # G major: G4 (392.00Hz), B4 (493.88Hz), D5 (587.33Hz)
    y2 = (
        np.sin(2 * np.pi * 392.00 * t2)
        + np.sin(2 * np.pi * 493.88 * t2)
        + np.sin(2 * np.pi * 587.33 * t2)
    ) / 3.0
    
    y = np.concatenate([y1, y2])
    
    result = recognizer.recognize(y, sr=sr)
    assert len(result) >= 2
    identified_chords = [r["chord"] for r in result]
    assert "C" in identified_chords
    assert "G" in identified_chords
