"""Tests for role tuning heuristics."""

from unittest.mock import patch

from bandscope_analysis.roles.tuning import get_setup_note


def test_get_setup_note_acoustic_guitar() -> None:
    """Test setup note for acoustic guitar with flat keys."""
    # Should suggest Capo 1
    note = get_setup_note("Acoustic Guitar", ["Eb", "Bb", "Fm", "Ab"])
    assert note == "Setup: Standard tuning, Capo 1"


def test_get_setup_note_bass_guitar() -> None:
    """Test that bass guitar ignores capo."""
    note = get_setup_note("Bass Guitar", ["Eb", "Bb", "Fm", "Ab"])
    assert note is None


def test_get_setup_note_keys() -> None:
    """Test that keys ignore capo."""
    note = get_setup_note("Keyboard", ["Eb", "Bb", "Fm", "Ab"])
    assert note is None


def test_get_setup_note_standard() -> None:
    """Test guitar in standard tuning, no capo."""
    note = get_setup_note("Electric Guitar", ["G", "D", "Em", "C"])
    assert note is None


def test_get_setup_note_drop_d() -> None:
    """Test drop D tuning detection."""
    note = get_setup_note("Electric Guitar", ["D5", "G5", "A5"])
    assert note == "Setup: Drop D tuning"


@patch("bandscope_analysis.roles.tuning.detect_capo_and_tuning")
def test_get_setup_note_mock_capo_and_tuning(mock_detect) -> None:
    """Test string generation when both capo and custom tuning are detected."""
    mock_detect.return_value = {"capo": 2, "tuning": "Open G"}
    note = get_setup_note("Electric Guitar", ["G", "C", "D"])
    assert note == "Setup: Open G tuning, Capo 2"
    mock_detect.assert_called_once_with(["G", "C", "D"])


@patch("bandscope_analysis.roles.tuning.detect_capo_and_tuning")
def test_get_setup_note_mock_custom_tuning_only(mock_detect) -> None:
    """Test string generation with custom tuning but no capo (capo=0)."""
    mock_detect.return_value = {"capo": 0, "tuning": "Eb"}
    note = get_setup_note("Guitar", ["Eb5", "Ab5"])
    assert note == "Setup: Eb tuning"
    mock_detect.assert_called_once_with(["Eb5", "Ab5"])


@patch("bandscope_analysis.roles.tuning.detect_capo_and_tuning")
def test_get_setup_note_mock_capo_only(mock_detect) -> None:
    """Test string generation with capo but standard tuning."""
    mock_detect.return_value = {"capo": 4, "tuning": "Standard"}
    note = get_setup_note("Guitar", ["E", "A", "B"])
    assert note == "Setup: Standard tuning, Capo 4"
    mock_detect.assert_called_once_with(["E", "A", "B"])


@patch("bandscope_analysis.roles.tuning.detect_capo_and_tuning")
def test_get_setup_note_mock_no_capo_standard_tuning(mock_detect) -> None:
    """Test string generation with standard tuning and no capo (capo None)."""
    mock_detect.return_value = {"capo": None, "tuning": "Standard"}
    note = get_setup_note("Guitar", ["C", "F", "G"])
    assert note is None
    mock_detect.assert_called_once_with(["C", "F", "G"])
