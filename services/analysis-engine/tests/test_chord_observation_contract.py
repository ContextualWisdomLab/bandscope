"""Test observation probability contracts for the chord recognizer."""

import numpy as np
import pytest

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def test_observation_probs_reject_similarity_frame_mismatch() -> None:
    """Reject similarity arrays that would otherwise broadcast across frames."""
    recognizer = ChordRecognizer()
    chromagram = np.ones((12, 5), dtype=np.float64)
    similarity = np.ones((24, 1), dtype=np.float64)
    rms = np.ones(5, dtype=np.float64)

    with pytest.raises(ValueError, match="similarity shape"):
        recognizer._build_observation_probs(chromagram, similarity, rms)
