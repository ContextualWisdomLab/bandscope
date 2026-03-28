"""Tests for chord analysis heuristics."""

from bandscope_analysis.chords.capo import detect_capo_and_tuning


def test_detect_capo_standard():
    """Test standard tuning and no capo."""
    result = detect_capo_and_tuning(["G", "D", "Em", "C"])
    assert result["capo"] == 0
    assert result["tuning"] == "Standard"

def test_detect_capo_fret1():
    """Test capo detection for flat keys."""
    result = detect_capo_and_tuning(["Eb", "Bb", "Fm", "Ab"])
    assert result["capo"] == 1
    assert result["tuning"] == "Standard"

def test_detect_capo_empty():
    """Test empty chord list."""
    result = detect_capo_and_tuning([])
    assert result["capo"] is None
    assert result["tuning"] == "Standard"

def test_detect_drop_d():
    """Test drop D tuning."""
    result = detect_capo_and_tuning(["D5", "G5", "A5"])
    assert result["capo"] == 0
    assert result["tuning"] == "Drop D"
