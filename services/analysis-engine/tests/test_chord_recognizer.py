"""Tests for the chord recognizer module."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer

SAMPLE_RATE = 22050
DURATION_SECONDS = 3


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
    y = np.random.randn(SAMPLE_RATE * 2) * 0.1
    result = recognizer.recognize(y, sr=SAMPLE_RATE)
    # Could be N (No chord) or empty
    assert all(chord["chord"] in ("N", "Unknown", "") for chord in result) if result else True


def test_chord_recognizer_c_major_chord() -> None:
    """Test chord recognition with a clear C major chord."""
    recognizer = ChordRecognizer()
    sr = SAMPLE_RATE
    t = np.linspace(0, DURATION_SECONDS, sr * DURATION_SECONDS, endpoint=False)
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


def test_chord_recognizer_hpss_exception() -> None:
    """Test for test_chord_recognizer_hpss_exception."""
    recognizer = ChordRecognizer()
    y = np.random.randn(SAMPLE_RATE * DURATION_SECONDS)

    with patch("librosa.effects.hpss", side_effect=Exception("HPSS Error")):
        chords = recognizer.recognize(y, sr=SAMPLE_RATE)
        assert isinstance(chords, list)


def test_chord_recognizer_chroma_cqt_exception() -> None:
    """Test for test_chord_recognizer_chroma_cqt_exception."""
    recognizer = ChordRecognizer()
    y = np.random.randn(SAMPLE_RATE * DURATION_SECONDS)

    with patch("librosa.feature.chroma_cqt", side_effect=Exception("CQT Error")):
        chords = recognizer.recognize(y, sr=SAMPLE_RATE)
        assert chords == []


def test_chord_recognizer_rms_exception() -> None:
    """Test for test_chord_recognizer_rms_exception."""
    recognizer = ChordRecognizer()
    y = np.random.randn(SAMPLE_RATE * DURATION_SECONDS)

    with patch("librosa.feature.rms", side_effect=Exception("RMS Error")):
        chords = recognizer.recognize(y, sr=SAMPLE_RATE)
        assert isinstance(chords, list)


def test_chord_recognizer_rms_padding() -> None:
    """Test for test_chord_recognizer_rms_padding."""
    recognizer = ChordRecognizer()
    y = np.random.randn(SAMPLE_RATE * DURATION_SECONDS)

    # Mock RMS to return something shorter than chromagram
    def mock_rms(*args, **kwargs):
        return np.array([[0.1, 0.1]])

    with patch("librosa.feature.rms", side_effect=mock_rms):
        chords = recognizer.recognize(y, sr=SAMPLE_RATE)
        assert isinstance(chords, list)


def test_chord_recognizer_empty_chromagram() -> None:
    """Test for test_chord_recognizer_empty_chromagram."""
    recognizer = ChordRecognizer()
    y = np.random.randn(SAMPLE_RATE * DURATION_SECONDS)

    # Mock chroma_cqt to return empty array
    with patch("librosa.feature.chroma_cqt", return_value=np.array([])):
        chords = recognizer.recognize(y, sr=SAMPLE_RATE)
        assert chords == []


def test_chord_recognizer_rms_longer() -> None:
    """Test for test_chord_recognizer_rms_longer."""
    recognizer = ChordRecognizer()
    y = np.random.randn(SAMPLE_RATE * DURATION_SECONDS)

    # Mock RMS to return something longer than chromagram
    def mock_rms(*args, **kwargs):
        # Return a very long array
        return np.array([np.ones(1000)])

    with patch("librosa.feature.rms", side_effect=mock_rms):
        chords = recognizer.recognize(y, sr=SAMPLE_RATE)
        assert isinstance(chords, list)


def test_chord_recognizer_changing_chords() -> None:
    """Test for test_chord_recognizer_changing_chords."""
    recognizer = ChordRecognizer()
    sr = SAMPLE_RATE
    t1 = np.linspace(0, DURATION_SECONDS, sr * DURATION_SECONDS, endpoint=False)
    # C major
    y1 = (
        np.sin(2 * np.pi * 261.63 * t1)
        + np.sin(2 * np.pi * 329.63 * t1)
        + np.sin(2 * np.pi * 392.00 * t1)
    ) / 3.0

    t2 = np.linspace(0, DURATION_SECONDS, sr * DURATION_SECONDS, endpoint=False)
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


def test_build_transition_matrix_properties() -> None:
    """Test that the transition matrix has the correct mathematical properties."""
    recognizer = ChordRecognizer()
    n_states = 24
    self_loop_prob = 0.9
    transition = recognizer._build_transition_matrix(n_states, self_loop_prob)

    assert transition.shape == (n_states, n_states)
    # Each diagonal element should equal self_loop_prob
    np.testing.assert_allclose(np.diag(transition), self_loop_prob)
    # Each row must sum to 1 (row-stochastic matrix)
    np.testing.assert_allclose(transition.sum(axis=1), np.ones(n_states), atol=1e-10)


def test_build_transition_matrix_single_state() -> None:
    """Test transition matrix for a degenerate single-state case."""
    recognizer = ChordRecognizer()
    transition = recognizer._build_transition_matrix(1, self_loop_prob=0.9)
    assert transition.shape == (1, 1)
    np.testing.assert_allclose(transition[0, 0], 1.0)


def test_decode_with_viterbi_output_shape() -> None:
    """Test that Viterbi decoding returns the correct number of frame states."""
    recognizer = ChordRecognizer()
    n_chords = 24
    n_frames = 50
    # Simulate similarity matrix: random non-negative values
    rng = np.random.default_rng(0)
    similarity = np.abs(rng.standard_normal((n_chords, n_frames)))
    states = recognizer._decode_with_viterbi(similarity)
    assert states.shape == (n_frames,)
    assert all(0 <= s < n_chords for s in states)


def test_decode_with_viterbi_consistent_with_dominant_chord() -> None:
    """Test Viterbi assigns the dominant chord when similarity is strongly peaked."""
    recognizer = ChordRecognizer()
    n_chords = 24
    n_frames = 20
    # Make chord index 5 (E major) dominant across all frames
    similarity = np.zeros((n_chords, n_frames))
    similarity[5, :] = 1.0
    states = recognizer._decode_with_viterbi(similarity)
    # All frames should decode to chord 5
    assert all(s == 5 for s in states)


def test_decode_with_viterbi_fallback_on_exception() -> None:
    """Test that argmax fallback is used when viterbi_discriminative raises."""
    recognizer = ChordRecognizer()
    n_chords = 24
    n_frames = 10
    rng = np.random.default_rng(42)
    similarity = np.abs(rng.standard_normal((n_chords, n_frames)))
    with patch("librosa.sequence.viterbi_discriminative", side_effect=RuntimeError("fail")):
        states = recognizer._decode_with_viterbi(similarity)
    # Should fall back to argmax
    expected = np.argmax(similarity, axis=0)
    np.testing.assert_array_equal(states, expected)


def test_chord_recognizer_uses_viterbi_by_default() -> None:
    """Test that recognize() calls _decode_with_viterbi instead of argmax."""
    recognizer = ChordRecognizer()
    sr = SAMPLE_RATE
    t = np.linspace(0, DURATION_SECONDS, sr * DURATION_SECONDS, endpoint=False)
    # C major chord
    y = (
        np.sin(2 * np.pi * 261.63 * t)
        + np.sin(2 * np.pi * 329.63 * t)
        + np.sin(2 * np.pi * 392.00 * t)
    ) / 3.0

    with patch.object(recognizer, "_decode_with_viterbi", wraps=recognizer._decode_with_viterbi) as mock_viterbi:
        result = recognizer.recognize(y, sr=sr)
        mock_viterbi.assert_called_once()
    assert len(result) > 0

