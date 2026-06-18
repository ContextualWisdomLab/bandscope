"""Tests for stem activity detection and role mapping."""

import numpy as np

from bandscope_analysis.roles.activity import (
    compute_handoffs,
    detect_stem_activity,
    map_stems_to_roles,
)


def test_detect_stem_activity_identifies_active_stems() -> None:
    """Ensure stems with energy above threshold are marked active."""
    sr = 22050
    # Create stems: vocals active in first half, bass always active
    duration = 10.0
    n_samples = int(sr * duration)

    vocals = np.zeros(n_samples, dtype=np.float32)
    vocals[: n_samples // 2] = np.sin(2 * np.pi * 440 * np.linspace(0, 5, n_samples // 2)).astype(
        np.float32
    )

    bass = (0.5 * np.sin(2 * np.pi * 100 * np.linspace(0, 10, n_samples))).astype(np.float32)

    stems = {"vocals": vocals, "bass": bass, "drums": np.zeros(n_samples, dtype=np.float32)}

    boundaries = [(0.0, 5.0), (5.0, 10.0)]

    activity = detect_stem_activity(stems, boundaries, sr)

    assert len(activity) == 2

    # First segment: vocals and bass active
    assert activity[0]["vocals"] is True
    assert activity[0]["bass"] is True

    # Second segment: only bass active (vocals silent)
    assert activity[1]["vocals"] is False
    assert activity[1]["bass"] is True


def test_detect_stem_activity_empty_inputs() -> None:
    """Ensure empty stems or boundaries return empty list."""
    assert detect_stem_activity({}, [(0.0, 5.0)], 22050) == []
    assert detect_stem_activity({"bass": np.zeros(1000, dtype=np.float32)}, [], 22050) == []


def test_detect_stem_activity_marks_empty_and_out_of_range_segments_inactive() -> None:
    """Ensure invalid stem segments fail closed as inactive."""
    stems = {
        "vocals": np.array([], dtype=np.float32),
        "bass": np.ones(10, dtype=np.float32),
    }

    activity = detect_stem_activity(stems, [(1.0, 2.0)], 10)

    assert activity == [{"vocals": False, "bass": False}]


def test_map_stems_to_roles_vocal_mapping() -> None:
    """Ensure vocal stem maps to lead-vocal role."""
    activity = {"vocals": True, "bass": False, "drums": False, "other": False}

    role_activity = map_stems_to_roles(activity)

    assert role_activity["lead-vocal"] is True
    assert role_activity["bass-guitar"] is False
    assert role_activity["keys-left"] is False
    assert role_activity["keys-right"] is False
    assert role_activity["acoustic-guitar"] is False


def test_map_stems_to_roles_other_maps_to_keys_and_guitar() -> None:
    """Ensure 'other' stem maps to keys and acoustic guitar roles."""
    activity = {"vocals": False, "bass": False, "drums": False, "other": True}

    role_activity = map_stems_to_roles(activity)

    assert role_activity["keys-left"] is True
    assert role_activity["keys-right"] is True
    assert role_activity["acoustic-guitar"] is True
    assert role_activity["lead-vocal"] is False
    assert role_activity["bass-guitar"] is False


def test_compute_handoffs_deactivation_creates_handoff() -> None:
    """Ensure roles that deactivate hand off to newly activating roles."""
    current = {"bass-guitar": True, "lead-vocal": True, "keys-left": False}
    next_section = {"bass-guitar": True, "lead-vocal": False, "keys-left": True}

    handoffs = compute_handoffs(current, next_section)

    # lead-vocal deactivates and should hand off to keys-left (which activates)
    assert "keys-left" in handoffs["lead-vocal"][0]  # handoff_to
    # keys-left activates and should receive handoff from lead-vocal
    assert "lead-vocal" in handoffs["keys-left"][1]  # handoff_from


def test_compute_handoffs_last_section_has_no_handoffs() -> None:
    """Ensure the last section (next=None) has empty handoff lists."""
    current = {"bass-guitar": True, "lead-vocal": True}

    handoffs = compute_handoffs(current, None)

    for role_id in current:
        assert handoffs[role_id] == ([], [])


def test_compute_handoffs_no_changes_means_no_handoffs() -> None:
    """Ensure sections with same activity have no handoffs."""
    current = {"bass-guitar": True, "lead-vocal": True, "keys-left": False}
    next_section = {"bass-guitar": True, "lead-vocal": True, "keys-left": False}

    handoffs = compute_handoffs(current, next_section)

    for role_id in current:
        assert handoffs[role_id] == ([], [])
