"""Tests for edge cases in the chord recognizer observation probability building."""

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def _harmonic_chromagram(n_frames: int) -> np.ndarray:
    """Return a non-flat chromagram whose variance does not imply no-chord."""
    chromagram = np.zeros((12, n_frames))
    chromagram[0, :] = 1.0
    return chromagram


def _distinct_similarity(n_frames: int) -> np.ndarray:
    """Return frame-distinguishable chord-template similarities."""
    similarity = np.zeros((24, n_frames))
    for frame in range(n_frames):
        similarity[frame % 24, frame] = 2.0
    return similarity


def _assert_probability_contract(probs: np.ndarray, n_frames: int) -> None:
    """Assert shape, finiteness, and per-frame normalization."""
    assert probs.shape == (25, n_frames)
    assert np.isfinite(probs).all()
    assert np.allclose(probs.sum(axis=0), 1.0)


def test_chord_recognizer_build_observation_probs_edge_cases():
    """Preserve frame alignment and neutral padding across mismatched inputs."""
    recognizer = ChordRecognizer()
    chromagram = _harmonic_chromagram(10)

    empty_probs = recognizer._build_observation_probs(
        chromagram,
        np.zeros((24, 0)),
        np.ones(10),
    )
    _assert_probability_contract(empty_probs, 10)
    assert np.allclose(empty_probs[:24], empty_probs[0][None, :])
    assert np.all(empty_probs[24] < 0.1)

    short_probs = recognizer._build_observation_probs(
        chromagram,
        _distinct_similarity(5),
        np.ones(10),
    )
    _assert_probability_contract(short_probs, 10)
    assert np.array_equal(np.argmax(short_probs[:24, :5], axis=0), np.arange(5))
    assert np.allclose(short_probs[:24, 5:], short_probs[0, 5:][None, :])
    assert np.all(short_probs[24, 5:] < 0.1)

    long_probs = recognizer._build_observation_probs(
        chromagram,
        _distinct_similarity(15),
        np.ones(10),
    )
    _assert_probability_contract(long_probs, 10)
    assert np.array_equal(np.argmax(long_probs[:24], axis=0), np.arange(10))

    short_rms_probs = recognizer._build_observation_probs(
        chromagram,
        _distinct_similarity(10),
        np.ones(5),
    )
    _assert_probability_contract(short_rms_probs, 10)
    assert np.array_equal(np.argmax(short_rms_probs[:24], axis=0), np.arange(10))
    assert np.all(short_rms_probs[24, 5:] < 0.1)


def test_short_similarity_preserves_observed_frames_and_neutral_padding():
    """Distinguish observed frame likelihoods and verify neutral missing-frame padding."""
    recognizer = ChordRecognizer()
    chromagram = _harmonic_chromagram(5)
    similarity = np.zeros((24, 2))
    similarity[0, 0] = 2.0
    similarity[1, 1] = 2.0
    rms = np.ones(5)

    probs = recognizer._build_observation_probs(chromagram, similarity, rms)

    _assert_probability_contract(probs, 5)
    assert probs[0, 0] > probs[1, 0]
    assert probs[1, 1] > probs[0, 1]
    assert not np.allclose(probs[:24, 0], probs[:24, 1])
    assert np.allclose(probs[:24, 2:], probs[0, 2:][None, :])
    # Missing model metadata is not equivalent to observed silence.
    assert np.all(probs[24, 2:] < 0.1)


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
