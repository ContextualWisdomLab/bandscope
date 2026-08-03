"""Tests for edge cases in the chord recognizer observation probability building."""

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def _assert_valid_probabilities(probs: np.ndarray, n_frames: int) -> None:
    """Assert observation probabilities are finite and normalized per frame."""
    assert probs.shape == (25, n_frames)
    assert np.all(np.isfinite(probs))
    assert np.allclose(probs.sum(axis=0), 1.0)


def test_chord_recognizer_build_observation_probs_edge_cases():
    """Preserve values across empty, padded, truncated, and short-RMS inputs."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 10))
    chromagram[0, :] = 1.0
    neutral_no_chord = 0.05 / 1.05
    uniform_chord = 1.0 / (24.0 * 1.05)

    empty_similarity = np.zeros((24, 0))
    empty_probs = recognizer._build_observation_probs(
        chromagram,
        empty_similarity,
        np.ones(10),
    )
    _assert_valid_probabilities(empty_probs, 10)
    assert np.allclose(empty_probs[:24], uniform_chord)
    assert np.allclose(empty_probs[24], neutral_no_chord)

    short_similarity = np.zeros((24, 5))
    short_similarity[np.arange(5), np.arange(5)] = 5.0
    short_probs = recognizer._build_observation_probs(
        chromagram,
        short_similarity,
        np.ones(10),
    )
    _assert_valid_probabilities(short_probs, 10)
    assert np.array_equal(np.argmax(short_probs[:24, :5], axis=0), np.arange(5))
    assert np.allclose(short_probs[:24, 5:], uniform_chord)
    assert np.allclose(short_probs[24], neutral_no_chord)

    long_similarity = np.zeros((24, 15))
    long_similarity[np.arange(15), np.arange(15)] = 5.0
    long_probs = recognizer._build_observation_probs(
        chromagram,
        long_similarity,
        np.ones(10),
    )
    _assert_valid_probabilities(long_probs, 10)
    assert np.array_equal(np.argmax(long_probs[:24], axis=0), np.arange(10))

    aligned_similarity = np.zeros((24, 10))
    aligned_similarity[np.arange(10), np.arange(10)] = 5.0
    short_rms_probs = recognizer._build_observation_probs(
        chromagram,
        aligned_similarity,
        np.ones(5),
    )
    _assert_valid_probabilities(short_rms_probs, 10)
    assert np.array_equal(np.argmax(short_rms_probs[:24], axis=0), np.arange(10))
    assert np.allclose(short_rms_probs[24, 5:], neutral_no_chord)


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
    chromagram[0, :] = 1.0
    cases = (
        (np.zeros((24, 0)), np.ones(10)),
        (np.eye(24, 5), np.ones(10)),
        (np.eye(24, 15), np.ones(10)),
        (np.eye(24, 10), np.ones(5)),
    )

    for similarity, rms in cases:
        probs = recognizer._build_observation_probs(chromagram, similarity, rms)
        _assert_valid_probabilities(probs, 10)


def test_missing_observation_metadata_does_not_force_no_chord():
    """Keep uniform chord fallback neutral when similarity and RMS are absent."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 3))
    chromagram[0, :] = 1.0
    similarity = np.zeros((24, 0))
    rms = np.array([], dtype=float)

    probs = recognizer._build_observation_probs(chromagram, similarity, rms)

    _assert_valid_probabilities(probs, 3)
    assert np.allclose(probs[24], 0.05 / 1.05)
    assert np.allclose(probs[:24], 1.0 / (24.0 * 1.05))
