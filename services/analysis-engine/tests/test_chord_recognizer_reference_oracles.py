"""Independent numerical oracles for the NumPy chord-recognition reference path."""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer

_NO_CHORD_STATE = 24


def _scalar_observation_oracle(
    chromagram: np.ndarray,
    similarity: np.ndarray,
    rms: np.ndarray,
) -> np.ndarray:
    """Compute observation probabilities one frame at a time without vectorization."""
    frame_count = chromagram.shape[1]
    similarity_frame_count = similarity.shape[1]
    result = np.zeros((25, frame_count), dtype=float)

    for frame_index in range(frame_count):
        if frame_index < similarity_frame_count:
            frame_similarity = similarity[:, frame_index]
            if np.all(np.isfinite(frame_similarity)):
                shifted = frame_similarity - np.max(frame_similarity)
                exponentiated = np.exp(shifted * 2.0)
                chord_probabilities = exponentiated / (np.sum(exponentiated) + 1e-12)
                maximum_similarity = float(np.max(frame_similarity))
            else:
                chord_probabilities = np.full(24, 1.0 / 24.0)
                maximum_similarity = 1.0
        else:
            chord_probabilities = np.full(24, 1.0 / 24.0)
            maximum_similarity = 1.0

        if frame_index < len(rms) and np.isfinite(rms[frame_index]):
            rms_value = float(rms[frame_index])
        else:
            rms_value = 1.0
        chroma_variance = float(np.var(chromagram[:, frame_index]))
        if not np.isfinite(chroma_variance):
            chroma_variance = 1.0
        no_chord = maximum_similarity < 0.3 or rms_value < 0.01 or chroma_variance < 0.02
        if no_chord:
            chord_probabilities = chord_probabilities * 0.1
            no_chord_probability = 0.9
        else:
            no_chord_probability = 0.05

        result[:24, frame_index] = chord_probabilities
        result[_NO_CHORD_STATE, frame_index] = no_chord_probability
        result[:, frame_index] /= np.sum(result[:, frame_index]) + 1e-12

    return result


def _dense_viterbi_oracle(
    transition_matrix: np.ndarray,
    observation_probabilities: np.ndarray,
) -> np.ndarray:
    """Decode with the original dense score table used before rolling storage."""
    state_count, frame_count = observation_probabilities.shape
    if frame_count == 0:
        return np.array([], dtype=np.intp)

    log_transition = np.log(transition_matrix + 1e-12)
    log_observation = np.log(observation_probabilities + 1e-12)
    score_table = np.zeros((state_count, frame_count), dtype=float)
    backpointer = np.zeros((state_count, frame_count), dtype=np.intp)
    score_table[:, 0] = np.log(1.0 / state_count) + log_observation[:, 0]

    for frame_index in range(1, frame_count):
        candidate_scores = score_table[:, frame_index - 1, np.newaxis] + log_transition
        backpointer[:, frame_index] = np.argmax(candidate_scores, axis=0)
        score_table[:, frame_index] = (
            np.max(candidate_scores, axis=0) + log_observation[:, frame_index]
        )

    states = np.zeros(frame_count, dtype=np.intp)
    states[-1] = int(np.argmax(score_table[:, -1]))
    for frame_index in range(frame_count - 2, -1, -1):
        states[frame_index] = backpointer[states[frame_index + 1], frame_index + 1]
    return states


def _frame_distinguishable_similarity(frame_count: int) -> np.ndarray:
    """Return non-uniform frames whose strongest chord changes deterministically."""
    similarity = np.empty((24, frame_count), dtype=float)
    baseline = np.linspace(0.31, 0.54, 24)
    for frame_index in range(frame_count):
        similarity[:, frame_index] = baseline + frame_index * 0.017
        similarity[(frame_index * 7 + 3) % 24, frame_index] = 1.7 + frame_index
    return similarity


@pytest.mark.parametrize("similarity_frame_count", [0, 3, 5, 8])
def test_vectorized_observations_match_scalar_oracle_across_length_mismatches(
    similarity_frame_count: int,
) -> None:
    """Prove padding and truncation against an independent framewise calculation."""
    recognizer = ChordRecognizer()
    frame_count = 5
    chromagram = np.arange(60, dtype=float).reshape(12, frame_count) / 10.0
    similarity = _frame_distinguishable_similarity(similarity_frame_count)
    rms = np.array([0.8, 0.0, 0.6], dtype=float)

    actual = recognizer._build_observation_probs(chromagram, similarity, rms)
    expected = _scalar_observation_oracle(chromagram, similarity, rms)

    assert actual.shape == (25, frame_count)
    assert np.all(np.isfinite(actual))
    assert np.allclose(actual.sum(axis=0), 1.0)
    assert np.allclose(actual, expected)

    for frame_index in range(min(frame_count, similarity_frame_count)):
        assert int(np.argmax(actual[:24, frame_index])) == (frame_index * 7 + 3) % 24
    if similarity_frame_count < frame_count:
        padded = actual[:24, similarity_frame_count:]
        assert np.allclose(padded, padded[0:1, :])


def test_vectorized_observations_match_scalar_oracle_for_non_finite_metadata() -> None:
    """Corrupt DSP metadata must stay finite, normalized, and oracle-aligned."""
    recognizer = ChordRecognizer()
    chromagram = np.ones((12, 3), dtype=float)
    chromagram[0, 1] = np.nan
    similarity = _frame_distinguishable_similarity(3)
    similarity[5, 1] = np.inf
    rms = np.array([0.8, np.nan, -np.inf], dtype=float)

    actual = recognizer._build_observation_probs(chromagram, similarity, rms)
    expected = _scalar_observation_oracle(chromagram, similarity, rms)

    assert np.all(np.isfinite(actual))
    assert np.allclose(actual.sum(axis=0), 1.0)
    assert np.allclose(actual, expected)
    assert np.allclose(actual[:24, 1], actual[0, 1])
    assert actual[24, 1] < actual[:24, 1].sum()


def test_no_chord_evidence_and_missing_metadata_remain_distinguishable() -> None:
    """Silence evidence selects no-chord while absent metadata stays neutral."""
    recognizer = ChordRecognizer()
    chromagram = np.arange(48, dtype=float).reshape(12, 4) / 7.0
    similarity = _frame_distinguishable_similarity(2)
    rms = np.array([0.7, 0.0], dtype=float)

    probabilities = recognizer._build_observation_probs(chromagram, similarity, rms)

    assert int(np.argmax(probabilities[:, 0])) != _NO_CHORD_STATE
    assert int(np.argmax(probabilities[:, 1])) == _NO_CHORD_STATE
    assert np.allclose(
        probabilities[_NO_CHORD_STATE, 2:],
        0.05 / 1.05,
    )
    assert np.allclose(
        probabilities[:24, 2:],
        1.0 / (24.0 * 1.05),
    )


@pytest.mark.parametrize("frame_count", [0, 1, 7, 31])
def test_rolling_viterbi_matches_independent_dense_oracle(
    frame_count: int,
) -> None:
    """Prove that rolling scores preserve the complete dense Viterbi sequence."""
    recognizer = ChordRecognizer()
    random_generator = np.random.default_rng(20260807 + frame_count)
    observations = random_generator.random((25, frame_count)) + 0.01
    if frame_count:
        observations /= observations.sum(axis=0, keepdims=True)

    expected = _dense_viterbi_oracle(
        recognizer._transition_matrix,
        observations,
    )
    actual = recognizer._viterbi_decode_reference(observations)

    assert actual.dtype == np.intp
    assert np.array_equal(actual, expected)
