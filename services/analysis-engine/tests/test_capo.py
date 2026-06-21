"""Tests for capo and tuning detection."""

from bandscope_analysis.chords.capo import detect_capo_and_tuning


def test_detect_capo_empty_chords() -> None:
    """Test with empty list of chords."""
    result = detect_capo_and_tuning([])
    assert result == {"capo": None, "tuning": "Standard"}


def test_detect_capo_drop_d() -> None:
    """Test Drop D tuning detection."""
    result = detect_capo_and_tuning(["D5", "G5", "A5"])
    assert result == {"capo": 0, "tuning": "Drop D"}

    # Mixed chords including D5
    result = detect_capo_and_tuning(["G", "C", "D5", "Em"])
    assert result == {"capo": 0, "tuning": "Drop D"}


def test_detect_capo_flat_keys_capo_1() -> None:
    """Test detection of flat keys suggesting Capo 1."""
    # Exactly 2 flat keys
    result = detect_capo_and_tuning(["Eb", "Bb", "Cm", "F"])
    assert result == {"capo": 1, "tuning": "Standard"}

    # More than 2 flat keys
    result = detect_capo_and_tuning(["Eb", "Bb", "Fm", "Ab"])
    assert result == {"capo": 1, "tuning": "Standard"}


def test_detect_capo_standard_tuning() -> None:
    """Test standard tuning fallback for common non-flat keys."""
    # Common open chords
    result = detect_capo_and_tuning(["G", "C", "D", "Em"])
    assert result == {"capo": 0, "tuning": "Standard"}

    # Only one flat key shouldn't trigger capo 1
    result = detect_capo_and_tuning(["F", "Bb", "C", "Dm"])
    assert result == {"capo": 0, "tuning": "Standard"}

    # Sharp keys
    result = detect_capo_and_tuning(["A", "D", "E", "F#m"])
    assert result == {"capo": 0, "tuning": "Standard"}
