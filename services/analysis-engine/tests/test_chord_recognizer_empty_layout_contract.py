"""Focused chord-recognizer empty-layout regression."""

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


def test_empty_two_dimensional_buffers_return_no_chords() -> None:
    """Both channel-first and sample-first empty arrays are equivalent empty audio."""
    recognizer = ChordRecognizer()

    assert recognizer.recognize(np.zeros((0, 2), dtype=np.float32), 44_100) == []
    assert recognizer.recognize(np.zeros((2, 0), dtype=np.float32), 44_100) == []
