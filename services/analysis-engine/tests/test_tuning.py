"""Tests for role tuning heuristics."""

from bandscope_analysis.roles.tuning import get_setup_note


def test_get_setup_note_acoustic_guitar():
    """Test setup note for acoustic guitar with flat keys."""
    # Should suggest Capo 1
    note = get_setup_note("Acoustic Guitar", ["Eb", "Bb", "Fm", "Ab"])
    assert note == "Setup: Standard tuning, Capo 1"

def test_get_setup_note_bass_guitar():
    """Test that bass guitar ignores capo."""
    note = get_setup_note("Bass Guitar", ["Eb", "Bb", "Fm", "Ab"])
    assert note is None

def test_get_setup_note_keys():
    """Test that keys ignore capo."""
    note = get_setup_note("Keyboard", ["Eb", "Bb", "Fm", "Ab"])
    assert note is None

def test_get_setup_note_standard():
    """Test guitar in standard tuning, no capo."""
    note = get_setup_note("Electric Guitar", ["G", "D", "Em", "C"])
    assert note is None

def test_get_setup_note_drop_d():
    """Test drop D tuning detection."""
    note = get_setup_note("Electric Guitar", ["D5", "G5", "A5"])
    assert note == "Setup: Drop D tuning"
