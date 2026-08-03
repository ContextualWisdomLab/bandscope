"""Regression tests for vectorized chord-recognition probability and Viterbi paths."""

import numpy as np
import pytest

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer

_NO_CHORD_STATE = 24
_NUM_CHORD_STATES = 25


def _scalar_observation_probs(
    chromagram: np.ndarray,
    similarity: np.ndarray,
    rms: np.ndarray,
) -> np.ndarray:
    """Build the intended observation probabilities one frame at a time."""
    n_frames = chromagram.shape[1]
    result = np.zeros((_NUM_CHORD_STATES, n_frames), dtype=np.float64)

    for frame in range(n_frames):
        if frame < similarity.shape[1]:
            frame_similarity = similarity[:, frame]
            shifted = frame_similarity - frame_similarity.max()
            exponentiated = np.exp(shifted * 2.0)
            result[:_NO_CHORD_STATE, frame] = exponentiated / (
                exponentiated.sum() + 1e-12
            )
            max_similarity = float(frame_similarity.max())
        else:
            result[:_NO_CHORD_STATE, frame] = 1.0 / _NO_CHORD_STATE
            max_similarity = 0.0

        rms_value = float(rms[frame]) if frame < len(rms) else 0.0
        chroma_variance = float(np.var(chromagram[:, frame]))
        if max_similarity < 0.3 or rms_value < 0.01 or chroma_variance < 0.02:
            result[:_NO_CHORD_STATE, frame] *= 0.1
            result[_NO_CHORD_STATE, frame] = 0.9
        else:
            result[_NO_CHORD_STATE, frame] = 0.05

        result[:, frame] /= result[:, frame].sum() + 1e-12

    return result


def _dense_viterbi_reference(
    recognizer: ChordRecognizer,
    observation_probs: np.ndarray,
) -> np.ndarray:
    """Decode with the former dense score table for exact sequence parity."""
    n_states, n_frames = observation_probs.shape
    if n_frames == 0:
        return np.array([], dtype=np.intp)

    log_transitions = np.log(recognizer._transition_matrix + 1e-12)
    log_observations = np.log(observation_probs + 1e-12)
    scores = np.zeros((n_states, n_frames), dtype=np.float64)
    backpointers = np.zeros((n_states, n_frames), dtype=np.intp)
    scores[:, 0] = np.log(1.0 / n_states) + log_observations[:, 0]

    for frame in range(1, n_frames):
        candidates = scores[:, frame - 1, np.newaxis] + log_transitions
        backpointers[:, frame] = np.argmax(candidates, axis=0)
        scores[:, frame] = np.max(candidates, axis=0) + log_observations[:, frame]

    states = np.zeros(n_frames, dtype=np.intp)
    states[-1] = int(np.argmax(scores[:, -1]))
    for frame in range(n_frames - 2, -1, -1):
        states[frame] = backpointers[states[frame + 1], frame + 1]
    return states


@pytest.mark.parametrize(
    ("similarity_frames", "rms_frames"),
    [(0, 0), (3, 8), (8, 3), (12, 12)],
)
def test_vectorized_observation_probabilities_match_scalar_contract(
    similarity_frames: int,
    rms_frames: int,
) -> None:
    """Vectorization preserves values for empty, short, exact, and long inputs."""
    generator = np.random.default_rng(20260803 + similarity_frames + rms_frames)
    chromagram = generator.random((12, 8), dtype=np.float64)
    similarity = generator.random((24, similarity_frames), dtype=np.float64)
    rms = generator.random(rms_frames, dtype=np.float64) * 0.2
    recognizer = ChordRecognizer()

    actual = recognizer._build_observation_probs(chromagram, similarity, rms)
    expected = _scalar_observation_probs(chromagram, similarity, rms)

    assert actual.shape == (_NUM_CHORD_STATES, chromagram.shape[1])
    assert np.isfinite(actual).all()
    np.testing.assert_allclose(actual.sum(axis=0), np.ones(chromagram.shape[1]))
    np.testing.assert_allclose(actual, expected, rtol=1e-12, atol=1e-12)


def test_vectorized_observation_probabilities_support_zero_frames() -> None:
    """An empty analysis window returns an empty, correctly shaped matrix."""
    recognizer = ChordRecognizer()

    probabilities = recognizer._build_observation_probs(
        np.empty((12, 0)),
        np.empty((24, 0)),
        np.empty(0),
    )

    assert probabilities.shape == (_NUM_CHORD_STATES, 0)


@pytest.mark.parametrize("n_frames", [0, 1, 7, 31])
def test_rolling_viterbi_scores_match_dense_reference(n_frames: int) -> None:
    """Rolling score storage preserves the former dense decoder's exact path."""
    generator = np.random.default_rng(732 + n_frames)
    observations = generator.random((_NUM_CHORD_STATES, n_frames), dtype=np.float64)
    if n_frames:
        observations /= observations.sum(axis=0, keepdims=True)
    recognizer = ChordRecognizer()

    actual = recognizer._viterbi_decode_reference(observations)
    expected = _dense_viterbi_reference(recognizer, observations)

    np.testing.assert_array_equal(actual, expected)
