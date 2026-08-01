"""Tests for edge cases in the chord recognizer observation probability building."""

import numpy as np

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
