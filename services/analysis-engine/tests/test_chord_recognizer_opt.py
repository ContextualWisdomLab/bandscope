"""Regression tests for vectorized chord observations and rolling-score Viterbi."""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer

_NUM_CHORD_TEMPLATES = 24
_NO_CHORD_STATE = 24
_EPSILON = 1e-12


def _scalar_observation_probs(
    chromagram: np.ndarray,
    similarity: np.ndarray,
    rms: np.ndarray,
) -> np.ndarray:
    """Return an independent frame-by-frame observation-probability oracle."""
    n_frames = chromagram.shape[1]
    probabilities = np.zeros((_NUM_CHORD_TEMPLATES + 1, n_frames), dtype=float)
    chroma_variances = np.var(chromagram, axis=0)

    for frame_index in range(n_frames):
        if frame_index < similarity.shape[1]:
            frame_similarity = similarity[:, frame_index]
            shifted = frame_similarity - np.max(frame_similarity)
            exponentiated = np.exp(shifted * 2.0)
            probabilities[:_NUM_CHORD_TEMPLATES, frame_index] = exponentiated / (
                np.sum(exponentiated) + _EPSILON
            )
            maximum_similarity = float(np.max(frame_similarity))
        else:
            probabilities[:_NUM_CHORD_TEMPLATES, frame_index] = (
                1.0 / _NUM_CHORD_TEMPLATES
            )
            maximum_similarity = 0.0

        rms_value = float(rms[frame_index]) if frame_index < len(rms) else 0.0
        is_no_chord = (
            maximum_similarity < 0.3
            or rms_value < 0.01
            or chroma_variances[frame_index] < 0.02
        )
        if is_no_chord:
            probabilities[:_NUM_CHORD_TEMPLATES, frame_index] *= 0.1
            probabilities[_NO_CHORD_STATE, frame_index] = 0.9
        else:
            probabilities[_NO_CHORD_STATE, frame_index] = 0.05

        probabilities[:, frame_index] /= (
            np.sum(probabilities[:, frame_index]) + _EPSILON
        )

    return probabilities


def _dense_viterbi_reference(
    recognizer: ChordRecognizer,
    observation_probs: np.ndarray,
) -> np.ndarray:
    """Return the former dense-score Viterbi result for parity comparison."""
    n_states, n_frames = observation_probs.shape
    if n_frames == 0:
        return np.array([], dtype=np.intp)

    log_transition = np.log(recognizer._transition_matrix + _EPSILON)
    log_observations = np.log(observation_probs + _EPSILON)
    scores = np.zeros((n_states, n_frames), dtype=float)
    backpointers = np.zeros((n_states, n_frames), dtype=np.intp)
    scores[:, 0] = np.log(1.0 / n_states) + log_observations[:, 0]

    for frame_index in range(1, n_frames):
        transition_scores = scores[:, frame_index - 1, np.newaxis] + log_transition
        backpointers[:, frame_index] = np.argmax(transition_scores, axis=0)
        scores[:, frame_index] = np.max(transition_scores, axis=0) + log_observations[
            :, frame_index
        ]

    states = np.zeros(n_frames, dtype=np.intp)
    states[-1] = int(np.argmax(scores[:, -1]))
    for frame_index in range(n_frames - 2, -1, -1):
        states[frame_index] = backpointers[
            states[frame_index + 1], frame_index + 1
        ]
    return states


@pytest.mark.parametrize(
    ("frame_count", "similarity_frame_count", "rms_frame_count"),
    [
        (0, 0, 0),
        (10, 0, 10),
        (10, 5, 10),
        (10, 10, 5),
        (10, 10, 10),
        (10, 15, 15),
    ],
)
def test_vectorized_observation_probabilities_match_scalar_oracle(
    frame_count: int,
    similarity_frame_count: int,
    rms_frame_count: int,
) -> None:
    """Vectorization must preserve scalar semantics for all length relationships."""
    random = np.random.default_rng(20260803 + similarity_frame_count + rms_frame_count)
    recognizer = ChordRecognizer()
    chromagram = random.random((12, frame_count))
    similarity = random.normal(size=(_NUM_CHORD_TEMPLATES, similarity_frame_count))
    rms = random.random(rms_frame_count) * 0.04

    actual = recognizer._build_observation_probs(chromagram, similarity, rms)
    expected = _scalar_observation_probs(chromagram, similarity, rms)

    assert actual.shape == (_NUM_CHORD_TEMPLATES + 1, frame_count)
    np.testing.assert_allclose(actual, expected, rtol=0.0, atol=1e-12)
    assert np.all(np.isfinite(actual))
    if frame_count:
        np.testing.assert_allclose(actual.sum(axis=0), 1.0, rtol=0.0, atol=1e-10)


@pytest.mark.parametrize("frame_count", [0, 1, 7, 31])
def test_rolling_viterbi_scores_match_dense_reference(frame_count: int) -> None:
    """Rolling score storage must decode exactly like the former dense matrix."""
    random = np.random.default_rng(732_000 + frame_count)
    recognizer = ChordRecognizer()
    observations = random.random((25, frame_count))
    if frame_count:
        observations /= observations.sum(axis=0, keepdims=True)

    expected = _dense_viterbi_reference(recognizer, observations)
    actual = recognizer._viterbi_decode_reference(observations)

    np.testing.assert_array_equal(actual, expected)
    assert actual.dtype == np.intp
