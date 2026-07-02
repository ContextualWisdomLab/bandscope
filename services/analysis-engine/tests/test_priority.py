"""Tests for the rehearsal priority calculation module."""

from bandscope_analysis.roles.model import RehearsalPriority
from bandscope_analysis.roles.priority import calculate_rehearsal_priority


def test_calculate_priority_low_confidence():
    """Test that low confidence always yields HIGH priority."""
    role = {
        "confidence": {"level": "low"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(role) == RehearsalPriority.HIGH


def test_calculate_priority_with_overlap():
    """Test that having overlap warnings yields HIGH priority."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": ["Melodic overlap"],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(role) == RehearsalPriority.HIGH


def test_calculate_priority_medium_confidence():
    """Test that medium confidence yields MEDIUM priority without overlaps."""
    role = {
        "confidence": {"level": "medium"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(role) == RehearsalPriority.MEDIUM


def test_calculate_priority_with_setup_note():
    """Test that having setup notes yields MEDIUM priority even if confidence is high."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "Switch to distortion",
    }
    assert calculate_rehearsal_priority(role) == RehearsalPriority.MEDIUM


def test_calculate_priority_low():
    """Test that high confidence with no warnings or notes yields LOW priority."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(role) == RehearsalPriority.LOW
