"""Tests for the role extraction and part graph models."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.roles.extractor import RoleExtractor
from bandscope_analysis.roles.model import (
    CueAnchorKind,
    RehearsalPriority,
    RoleType,
)


def test_role_type_enum() -> None:
    """Verify RoleType enum values match the domain requirements."""
    assert RoleType.INSTRUMENT.value == "instrument"
    assert RoleType.VOCAL.value == "vocal"
    assert RoleType.HAND.value == "hand"


def test_rehearsal_priority_enum() -> None:
    """Verify RehearsalPriority enum values match."""
    assert RehearsalPriority.LOW.value == "low"
    assert RehearsalPriority.MEDIUM.value == "medium"
    assert RehearsalPriority.HIGH.value == "high"


def test_cue_anchor_kind_enum() -> None:
    """Verify CueAnchorKind enum values match."""
    assert CueAnchorKind.LYRIC.value == "lyric"
    assert CueAnchorKind.COUNT.value == "count"
    assert CueAnchorKind.TRANSITION.value == "transition"


def test_role_extractor_basic() -> None:
    """Test that RoleExtractor returns a valid topology structure."""
    extractor = RoleExtractor()

    sections = [{"id": "intro"}, {"id": "verse-1"}]

    result = extractor.extract(sections)

    assert "topologies" in result
    assert "extraction_notes" in result
    assert len(result["topologies"]) == 2

    # Check intro section
    intro_topology = result["topologies"][0]
    assert intro_topology["section_id"] == "intro"
    assert len(intro_topology["active_roles"]) == 5

    roles_by_id = {r["id"]: r for r in intro_topology["active_roles"]}
    assert "bass-guitar" in roles_by_id
    assert "lead-vocal" in roles_by_id
    assert "keys-right" in roles_by_id
    assert "keys-left" in roles_by_id
    assert roles_by_id["lead-vocal"]["roleType"] == "vocal"
    assert "Melodic overlap" in roles_by_id["lead-vocal"]["overlapWarnings"][0]

    intro_graph = intro_topology["part_graph"]
    graph_by_role = {n["role_id"]: n for n in intro_graph}

    # Check handoff relation
    assert "lead-vocal" in graph_by_role["bass-guitar"]["handoff_to"]
    assert "bass-guitar" in graph_by_role["lead-vocal"]["handoff_from"]

    # Check verse-1 section (only bass)
    verse_topology = result["topologies"][1]
    assert verse_topology["section_id"] == "verse-1"
    assert len(verse_topology["active_roles"]) == 2
    assert verse_topology["active_roles"][0]["id"] == "bass-guitar"
    assert verse_topology["active_roles"][0]["roleType"] == "instrument"
    assert verse_topology["active_roles"][0]["rehearsalPriority"] == "high"
    assert "Density warning" in verse_topology["active_roles"][0]["overlapWarnings"][0]

    verse_graph = verse_topology["part_graph"]
    assert len(verse_graph) == 5
    assert verse_graph[1]["role_id"] == "acoustic-guitar"
    assert verse_graph[1]["is_active"] is True
    assert verse_graph[2]["role_id"] == "keys-left"
    assert verse_graph[2]["is_active"] is False
    assert verse_graph[3]["role_id"] == "keys-right"
    assert verse_graph[3]["is_active"] is False
    assert verse_graph[0]["role_id"] == "bass-guitar"
    assert verse_graph[0]["handoff_to"] == []


def test_role_extractor_empty() -> None:
    """Test extractor with empty sections list."""
    extractor = RoleExtractor()
    result = extractor.extract([])
    assert result["topologies"] == []


def test_role_extractor_invalid_section() -> None:
    """Test that RoleExtractor handles non-dict sections gracefully."""
    extractor = RoleExtractor()
    sections = [{"id": "intro"}, "invalid-section-string"]
    result = extractor.extract(sections)
    assert len(result["topologies"]) == 2
    assert result["topologies"][0]["section_id"] == "intro"
    assert result["topologies"][1]["section_id"] == "section-1"


def test_role_extractor_falls_back_when_activity_detection_fails() -> None:
    """Ensure activity detection failures keep role extraction usable."""
    extractor = RoleExtractor()
    sections = [{"id": "verse-1"}]
    audio_features = {
        "stems": {"bass": np.ones(100, dtype=np.float32)},
        "sr": 10,
        "boundaries": [(0.0, 10.0)],
    }

    with (
        patch(
            "bandscope_analysis.roles.extractor.detect_stem_activity",
            side_effect=RuntimeError("bad activity map"),
        ),
        patch.object(
            RoleExtractor,
            "_extract_features",
            return_value=(
                {"lowestNote": "", "highestNote": ""},
                "",
                {"lowestNote": "", "highestNote": ""},
                "",
            ),
        ),
    ):
        result = extractor.extract(sections, audio_features)

    assert result["topologies"][0]["section_id"] == "verse-1"
    assert result["topologies"][0]["part_graph"][0]["role_id"] == "bass-guitar"


def test_role_extractor_emits_activity_corroborated_vamp_plan() -> None:
    """Emit a vamp plan only from real stem activity plus an upcoming entrance."""
    extractor = RoleExtractor()
    sections = [{"id": "verse-1"}, {"id": "chorus-1"}]
    audio_features = {
        "stems": {"bass": np.ones(200, dtype=np.float32)},
        "sr": 10,
        "boundaries": [(0.0, 10.0), (10.0, 20.0)],
    }

    with (
        patch(
            "bandscope_analysis.roles.extractor.detect_stem_activity",
            return_value=[
                {"bass": True, "vocals": False, "other": False},
                {"bass": True, "vocals": True, "other": False},
            ],
        ),
        patch.object(
            RoleExtractor,
            "_extract_features",
            return_value=(
                {"lowestNote": "", "highestNote": ""},
                "",
                {"lowestNote": "E1", "highestNote": "E3"},
                "Em",
            ),
        ),
    ):
        result = extractor.extract(sections, audio_features)

    verse_roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}
    assert verse_roles["bass-guitar"]["vampPlan"] == (
        "Keep this part going until Lead Vocal enters in the next section."
    )


def test_role_extractor_groups_shared_other_stem_entrance_for_vamp_plan() -> None:
    """Name the shared accompaniment stem without inventing a specific instrument."""
    extractor = RoleExtractor()
    sections = [{"id": "verse-1"}, {"id": "chorus-1"}]
    audio_features = {
        "stems": {"bass": np.ones(200, dtype=np.float32)},
        "sr": 10,
        "boundaries": [(0.0, 10.0), (10.0, 20.0)],
    }

    with (
        patch(
            "bandscope_analysis.roles.extractor.detect_stem_activity",
            return_value=[
                {"bass": True, "vocals": False, "other": False},
                {"bass": True, "vocals": False, "other": True},
            ],
        ),
        patch.object(
            RoleExtractor,
            "_extract_features",
            return_value=(
                {"lowestNote": "", "highestNote": ""},
                "",
                {"lowestNote": "E1", "highestNote": "E3"},
                "Em",
            ),
        ),
    ):
        result = extractor.extract(sections, audio_features)

    verse_roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}
    assert verse_roles["bass-guitar"]["vampPlan"] == (
        "Keep this part going until Accompaniment enters in the next section."
    )


def test_role_extractor_keeps_mixed_entrances_vamp_plan_ambiguous() -> None:
    """Do not emit a vamp plan when distinct entrance sources arrive together."""
    extractor = RoleExtractor()
    sections = [{"id": "verse-1"}, {"id": "chorus-1"}]
    audio_features = {
        "stems": {"bass": np.ones(200, dtype=np.float32)},
        "sr": 10,
        "boundaries": [(0.0, 10.0), (10.0, 20.0)],
    }

    with (
        patch(
            "bandscope_analysis.roles.extractor.detect_stem_activity",
            return_value=[
                {"bass": True, "vocals": False, "other": False},
                {"bass": True, "vocals": True, "other": True},
            ],
        ),
        patch.object(
            RoleExtractor,
            "_extract_features",
            return_value=(
                {"lowestNote": "", "highestNote": ""},
                "",
                {"lowestNote": "E1", "highestNote": "E3"},
                "Em",
            ),
        ),
    ):
        result = extractor.extract(sections, audio_features)

    verse_roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}
    assert "vampPlan" not in verse_roles["bass-guitar"]


def test_activity_vamp_plan_rejects_unknown_activating_role() -> None:
    """Fail closed when activity names a role absent from the rehearsal role catalog."""
    extractor = RoleExtractor()
    empty_range = {"lowestNote": "", "highestNote": ""}
    roles = extractor._build_roles("", empty_range, "", empty_range)

    assert (
        extractor._activity_vamp_plan(
            "bass-guitar",
            roles,
            {"bass-guitar": True, "unmodeled-role": False},
            {"bass-guitar": True, "unmodeled-role": True},
        )
        is None
    )
