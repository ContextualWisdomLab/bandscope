"""Tests for edge cases in the chord recognizer observation probability building."""

import numpy as np
import pytest

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def test_chord_recognizer_build_observation_probs_edge_cases():
    """Test edge cases for _build_observation_probs."""
    recognizer = ChordRecognizer()

    # 1. Empty similarity (n_sim_frames == 0)
    chromagram = np.zeros((12, 10))
    similarity = np.zeros((24, 0))
    rms = np.zeros(10)

    probs = recognizer._build_observation_probs(chromagram, similarity, rms)
    assert probs.shape == (25, 10)

    # 2. Similarity shorter than chromagram (n_sim_frames < n_frames)
    similarity = np.zeros((24, 5))
    probs = recognizer._build_observation_probs(chromagram, similarity, rms)
    assert probs.shape == (25, 10)

    # 3. Similarity longer than chromagram (n_sim_frames > n_frames)
    chromagram = np.zeros((12, 10))
    similarity = np.zeros((24, 15))
    probs = recognizer._build_observation_probs(chromagram, similarity, rms)
    assert probs.shape == (25, 10)

    # 4. rms shorter than n_frames
    chromagram = np.zeros((12, 10))
    similarity = np.zeros((24, 10))
    rms = np.zeros(5)
    probs = recognizer._build_observation_probs(chromagram, similarity, rms)
    assert probs.shape == (25, 10)


def test_create_chord_segments_handles_short_similarity(monkeypatch):
    """Keep confidence generation aligned when observation frames are padded."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 4))
    similarity = np.zeros((24, 1))
    rms = np.ones(4)
    monkeypatch.setattr(
        recognizer,
        "_viterbi_decode",
        lambda observation_probs: np.zeros(observation_probs.shape[1], dtype=np.intp),
    )

    segments = recognizer._create_chord_segments(chromagram, similarity, rms, 22_050)

    assert len(segments) == 1
    assert segments[0]["chord"] == "C"
    assert segments[0]["confidence"] == "low"


def test_missing_similarity_fallback_vector_is_allocated_once(monkeypatch):
    """Reuse one neutral vector instead of allocating it for every padded frame."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 4))
    similarity = np.zeros((24, 1))
    rms = np.ones(4)
    original_zeros = np.zeros
    fallback_allocations = 0

    def tracked_zeros(shape, *args, **kwargs):
        """Count only one-dimensional chord-template fallback allocations."""
        nonlocal fallback_allocations
        if shape in {24, (24,)}:
            fallback_allocations += 1
        return original_zeros(shape, *args, **kwargs)

    monkeypatch.setattr(np, "zeros", tracked_zeros)
    monkeypatch.setattr(
        recognizer,
        "_viterbi_decode",
        lambda observation_probs: original_zeros(observation_probs.shape[1], dtype=np.intp),
    )

    recognizer._create_chord_segments(chromagram, similarity, rms, 22_050)

    assert fallback_allocations == 1


def test_observation_probability_edge_cases_are_normalized():
    """Keep finite normalized columns across observation length mismatches."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 10))
    cases = (
        (np.zeros((24, 0)), np.zeros(10)),
        (np.zeros((24, 5)), np.zeros(10)),
        (np.zeros((24, 15)), np.zeros(10)),
        (np.zeros((24, 10)), np.zeros(5)),
    )

    for similarity, rms in cases:
        probs = recognizer._build_observation_probs(chromagram, similarity, rms)
        assert probs.shape == (25, 10)
        assert np.all(np.isfinite(probs))
        assert np.allclose(probs.sum(axis=0), 1.0)


def test_missing_observation_metadata_does_not_force_no_chord():
    """Keep uniform chord fallback neutral when similarity and RMS are absent."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 3))
    chromagram[0, :] = 1.0
    similarity = np.zeros((24, 0))
    rms = np.array([], dtype=float)

    probs = recognizer._build_observation_probs(chromagram, similarity, rms)

    assert np.allclose(probs.sum(axis=0), 1.0)
    assert np.allclose(probs[24], 0.05 / 1.05)
    assert np.allclose(probs[:24], 1.0 / (24.0 * 1.05))


def test_recognize_rejects_oversized_audio():
    """Reject audio longer than the maximum allowed duration."""
    recognizer = ChordRecognizer()
    sr = 22050
    # 301 seconds of audio
    y = np.zeros(301 * sr, dtype=np.float32)
    with pytest.raises(ValueError, match="Audio length exceeds maximum"):
        recognizer.recognize(y, sr=sr)
