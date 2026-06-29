"""Tests for the rehearsal priority calculation module."""

from typing import Any, cast

from bandscope_analysis.roles.model import RehearsalPriority
from bandscope_analysis.roles.priority import calculate_rehearsal_priority


def test_calculate_priority_low_confidence() -> None:
    """Test that low confidence always yields HIGH priority."""
    role = {
        "confidence": {"level": "low"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.HIGH


def test_calculate_priority_with_overlap() -> None:
    """Test that having overlap warnings yields HIGH priority."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": ["Melodic overlap"],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.HIGH


def test_calculate_priority_medium_confidence() -> None:
    """Test that medium confidence yields MEDIUM priority without overlaps."""
    role = {
        "confidence": {"level": "medium"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.MEDIUM


def test_calculate_priority_with_setup_note() -> None:
    """Test that having setup notes yields MEDIUM priority even if confidence is high."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "Switch to distortion",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.MEDIUM


def test_calculate_priority_with_simplification() -> None:
    """Test that simplification yields MEDIUM priority even if confidence is high."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
        "simplification": "Simplify to quarter notes",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.MEDIUM


def test_calculate_priority_low() -> None:
    """Test that high confidence with no warnings or notes yields LOW priority."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.LOW


def test_calculate_priority_with_manual_override() -> None:
    """Test that manual overrides yield HIGH priority."""
    role = {
        "confidence": {"level": "high"},
        "overlapWarnings": [],
        "manualOverrides": ["User corrected chord"],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.HIGH


def test_calculate_priority_empty_role() -> None:
    """Test missing role fields fall back to LOW priority."""
    role = {}
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.LOW


def test_calculate_priority_missing_confidence_level() -> None:
    """Test missing confidence level falls through as LOW without other signals."""
    role = {
        "confidence": {},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.LOW


def test_calculate_priority_multiple_medium_conditions() -> None:
    """Test multiple medium signals still yield MEDIUM priority."""
    role = {
        "confidence": {"level": "medium"},
        "overlapWarnings": [],
        "manualOverrides": [],
        "setupNote": "Some note",
        "simplification": "Some simplification",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.MEDIUM


def test_calculate_priority_high_overrides_medium() -> None:
    """Test high priority signals override medium priority signals."""
    role = {
        "confidence": {"level": "medium"},
        "overlapWarnings": ["Warning"],
        "manualOverrides": [],
        "setupNote": "Note",
    }
    assert calculate_rehearsal_priority(cast(Any, role)) == RehearsalPriority.HIGH
