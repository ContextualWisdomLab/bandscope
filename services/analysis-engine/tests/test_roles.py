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


def _extract_with_activity(
    stem_activity: list[dict[str, bool]],
    section_ids: list[str] | None = None,
) -> dict[str, dict[str, object]]:
    """Run RoleExtractor against a patched stem-activity map."""
    extractor = RoleExtractor()
    sections = [
        {"id": section_id}
        for section_id in (section_ids or ["verse-1", "chorus-1"])
    ]
    audio_features = {
        "stems": {"bass": np.ones(200, dtype=np.float32)},
        "sr": 10,
        "boundaries": [
            (float(index * 10), float((index + 1) * 10))
            for index in range(len(sections))
        ],
    }
    with (
        patch(
            "bandscope_analysis.roles.extractor.detect_stem_activity",
            return_value=stem_activity,
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
    return {role["id"]: role for role in result["topologies"][0]["active_roles"]}


def test_role_extractor_emits_activity_corroborated_turnaround_plan() -> None:
    """Emit a turnaround plan only when two distinct sources continue together."""
    verse_roles = _extract_with_activity(
        [
            {"bass": True, "vocals": True, "other": False},
            {"bass": True, "vocals": True, "other": False},
        ]
    )
    assert verse_roles["bass-guitar"]["turnaroundPlan"] == (
        "Turn these last bars with Lead Vocal; land the downbeat together."
    )
    assert verse_roles["lead-vocal"]["turnaroundPlan"] == (
        "Turn these last bars with Bass Guitar; land the downbeat together."
    )


def test_role_extractor_groups_shared_other_stem_continuation_for_turnaround_plan() -> None:
    """Name the shared accompaniment stem without inventing a specific instrument."""
    verse_roles = _extract_with_activity(
        [
            {"bass": True, "vocals": False, "other": True},
            {"bass": True, "vocals": False, "other": True},
        ]
    )
    assert verse_roles["bass-guitar"]["turnaroundPlan"] == (
        "Turn these last bars with Accompaniment; land the downbeat together."
    )
    assert verse_roles["keys-right"]["turnaroundPlan"] == (
        "Turn these last bars with Bass Guitar; land the downbeat together."
    )


def test_role_extractor_keeps_mixed_continuations_as_shared_turnaround_evidence() -> None:
    """Mixed shared continuation is the turnaround evidence, not an ambiguity."""
    verse_roles = _extract_with_activity(
        [
            {"bass": True, "vocals": True, "other": True},
            {"bass": True, "vocals": True, "other": True},
        ]
    )
    assert verse_roles["bass-guitar"]["turnaroundPlan"] == (
        "Turn these last bars with the rest of the band; land the downbeat together."
    )
    assert verse_roles["lead-vocal"]["turnaroundPlan"] == (
        "Turn these last bars with the rest of the band; land the downbeat together."
    )
    assert verse_roles["acoustic-guitar"]["turnaroundPlan"] == (
        "Turn these last bars with the rest of the band; land the downbeat together."
    )


def test_role_extractor_keeps_single_continuation_turnaround_plan_unnamed() -> None:
    """A lone continuation is not a shared turnaround."""
    verse_roles = _extract_with_activity(
        [
            {"bass": True, "vocals": True, "other": False},
            {"bass": True, "vocals": False, "other": False},
        ]
    )
    assert "turnaroundPlan" not in verse_roles["bass-guitar"]
    assert "turnaroundPlan" not in verse_roles["lead-vocal"]


def test_role_extractor_keeps_last_section_turnaround_plan_unnamed() -> None:
    """Without a next section there is no shared-continuation evidence."""
    extractor = RoleExtractor()
    sections = [{"id": "outro"}]
    audio_features = {
        "stems": {"bass": np.ones(100, dtype=np.float32)},
        "sr": 10,
        "boundaries": [(0.0, 10.0)],
    }
    with (
        patch(
            "bandscope_analysis.roles.extractor.detect_stem_activity",
            return_value=[{"bass": True, "vocals": True, "other": True}],
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
    outro_roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}
    assert "turnaroundPlan" not in outro_roles["bass-guitar"]


def test_role_extractor_keeps_heuristic_turnaround_plan_unnamed() -> None:
    """Heuristic fallback topology must not invent a shared turnaround."""
    extractor = RoleExtractor()
    result = extractor.extract([{"id": "intro"}, {"id": "verse-1"}])
    intro_roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}
    verse_roles = {role["id"]: role for role in result["topologies"][1]["active_roles"]}
    assert all("turnaroundPlan" not in role for role in intro_roles.values())
    assert all("turnaroundPlan" not in role for role in verse_roles.values())


def test_activity_turnaround_plan_fails_closed_without_a_named_partner() -> None:
    """Unknown continuation partners stay unnamed instead of inventing copy."""
    assert (
        RoleExtractor._activity_turnaround_plan(
            "bass-guitar",
            {},
            {"bass-guitar": True, "lead-vocal": True},
            {"bass-guitar": True, "lead-vocal": True},
        )
        is None
    )
    assert (
        RoleExtractor._activity_turnaround_plan(
            "keys-right",
            {},
            {"keys-right": True, "lead-vocal": True},
            {"keys-right": True, "lead-vocal": True},
        )
        is None
    )
