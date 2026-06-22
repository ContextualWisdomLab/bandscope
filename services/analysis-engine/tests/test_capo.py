"""Tests for capo and tuning detection heuristics."""

from bandscope_analysis.chords.capo import detect_capo_and_tuning


def test_detect_capo_and_tuning_empty_list():
    """Test capo detection with an empty chord list defaults to Standard."""
    assert detect_capo_and_tuning([]) == {"capo": None, "tuning": "Standard"}


def test_detect_capo_and_tuning_drop_d():
    """Test capo detection identifies Drop D tuning correctly."""
    assert detect_capo_and_tuning(["D5", "G", "A"]) == {"capo": 0, "tuning": "Drop D"}
    assert detect_capo_and_tuning(["D5"]) == {"capo": 0, "tuning": "Drop D"}


def test_detect_capo_and_tuning_capo_1():
    """Test capo detection identifies Capo 1 based on common flat keys."""
    # Exactly two flat keys
    assert detect_capo_and_tuning(["Eb", "Bb"]) == {"capo": 1, "tuning": "Standard"}
    # Three flat keys
    assert detect_capo_and_tuning(["Eb", "Fm", "Ab", "Cm"]) == {"capo": 1, "tuning": "Standard"}
    # Four flat keys
    assert detect_capo_and_tuning(["Eb", "Bb", "Fm", "Ab"]) == {"capo": 1, "tuning": "Standard"}


def test_detect_capo_and_tuning_default_standard():
    """Test capo detection falls back to default standard tuning."""
    # Regular open chords
    assert detect_capo_and_tuning(["G", "C", "D", "Em"]) == {"capo": 0, "tuning": "Standard"}
    # Only one flat key
    assert detect_capo_and_tuning(["Eb", "G", "C"]) == {"capo": 0, "tuning": "Standard"}
