"""Tests for edge cases in the chord recognizer observation probability building."""

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def test_chord_recognizer_build_observation_probs_edge_cases():
    """Validate normalized low-signal probabilities for every length mismatch."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 10))

    for similarity_frames, rms_frames in ((0, 10), (5, 10), (15, 10), (10, 5)):
        similarity = np.zeros((24, similarity_frames))
        rms = np.zeros(rms_frames)

        probs = recognizer._build_observation_probs(chromagram, similarity, rms)

        assert probs.shape == (25, 10)
        assert np.all(np.isfinite(probs))
        assert np.allclose(probs.sum(axis=0), 1.0)
        assert np.allclose(probs[:24], 0.1 / 24.0)
        assert np.allclose(probs[24], 0.9)


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
    """Preserve frame alignment and neutral padding across length mismatches."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 10))
    chromagram[0, :] = 1.0
    expected_uniform_chord = 1.0 / (24.0 * 1.05)
    expected_no_chord = 0.05 / 1.05

    empty_probs = recognizer._build_observation_probs(
        chromagram,
        np.zeros((24, 0)),
        np.ones(10),
    )
    assert empty_probs.shape == (25, 10)
    assert np.all(np.isfinite(empty_probs))
    assert np.allclose(empty_probs.sum(axis=0), 1.0)
    assert np.allclose(empty_probs[:24], expected_uniform_chord)
    assert np.allclose(empty_probs[24], expected_no_chord)

    short_similarity = np.zeros((24, 5))
    short_similarity[np.arange(5), np.arange(5)] = 1.0
    short_probs = recognizer._build_observation_probs(
        chromagram,
        short_similarity,
        np.ones(10),
    )
    assert short_probs.shape == (25, 10)
    assert np.all(np.isfinite(short_probs))
    assert np.allclose(short_probs.sum(axis=0), 1.0)
    assert np.array_equal(np.argmax(short_probs[:24, :5], axis=0), np.arange(5))
    assert np.allclose(short_probs[:24, 5:], expected_uniform_chord)
    assert np.allclose(short_probs[24, 5:], expected_no_chord)

    long_similarity = np.zeros((24, 15))
    long_similarity[np.arange(15), np.arange(15)] = 1.0
    long_probs = recognizer._build_observation_probs(
        chromagram,
        long_similarity,
        np.ones(10),
    )
    assert long_probs.shape == (25, 10)
    assert np.all(np.isfinite(long_probs))
    assert np.allclose(long_probs.sum(axis=0), 1.0)
    assert np.array_equal(np.argmax(long_probs[:24], axis=0), np.arange(10))

    aligned_similarity = np.zeros((24, 10))
    aligned_similarity[np.arange(10), np.arange(10)] = 1.0
    short_rms_probs = recognizer._build_observation_probs(
        chromagram,
        aligned_similarity,
        np.ones(5),
    )
    assert short_rms_probs.shape == (25, 10)
    assert np.all(np.isfinite(short_rms_probs))
    assert np.allclose(short_rms_probs.sum(axis=0), 1.0)
    assert np.array_equal(np.argmax(short_rms_probs[:24], axis=0), np.arange(10))
    assert np.allclose(short_rms_probs[24, 5:], expected_no_chord)


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
