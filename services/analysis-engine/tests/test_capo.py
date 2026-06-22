"""Tests for capo and tuning detection heuristics."""

from bandscope_analysis.chords.capo import detect_capo_and_tuning


def test_detect_capo_and_tuning_empty():
    """Test that empty or None input returns Standard tuning and None capo."""
    assert detect_capo_and_tuning([]) == {"capo": None, "tuning": "Standard"}
    assert detect_capo_and_tuning(None) == {"capo": None, "tuning": "Standard"}


def test_detect_capo_and_tuning_drop_d():
    """Test that detecting a D5 chord implies Drop D tuning."""
    assert detect_capo_and_tuning(["D5", "G", "A"]) == {"capo": 0, "tuning": "Drop D"}
    assert detect_capo_and_tuning(["D5"]) == {"capo": 0, "tuning": "Drop D"}


def test_detect_capo_and_tuning_flat_keys():
    """Test that two or more flat keys implies Capo 1 and Standard tuning."""
    # Exactly 2 flat keys
    assert detect_capo_and_tuning(["Eb", "Bb", "C", "G"]) == {"capo": 1, "tuning": "Standard"}
    # More than 2 flat keys
    assert detect_capo_and_tuning(["Eb", "Bb", "Fm"]) == {"capo": 1, "tuning": "Standard"}
    # Only 1 flat key -> fallback
    assert detect_capo_and_tuning(["Eb", "C", "G"]) == {"capo": 0, "tuning": "Standard"}


def test_detect_capo_and_tuning_fallback():
    """Test that standard keys imply Capo 0 and Standard tuning."""
    assert detect_capo_and_tuning(["G", "C", "D", "Em"]) == {"capo": 0, "tuning": "Standard"}
