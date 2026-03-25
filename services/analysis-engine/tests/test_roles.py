"""Tests for the role extraction and part graph models."""

from bandscope_analysis.roles.extractor import RoleExtractor
from bandscope_analysis.roles.model import (
    CueAnchorKind,
    RehearsalPriority,
    RoleType,
)


def test_role_type_enum():
    """Verify RoleType enum values match the domain requirements."""
    assert RoleType.INSTRUMENT == "instrument"
    assert RoleType.VOCAL == "vocal"
    assert RoleType.HAND == "hand"


def test_rehearsal_priority_enum():
    """Verify RehearsalPriority enum values match."""
    assert RehearsalPriority.LOW == "low"
    assert RehearsalPriority.MEDIUM == "medium"
    assert RehearsalPriority.HIGH == "high"


def test_cue_anchor_kind_enum():
    """Verify CueAnchorKind enum values match."""
    assert CueAnchorKind.LYRIC == "lyric"
    assert CueAnchorKind.COUNT == "count"
    assert CueAnchorKind.TRANSITION == "transition"


def test_role_extractor_basic():
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
    assert len(intro_topology["active_roles"]) == 3

    roles_by_id = {r["id"]: r for r in intro_topology["active_roles"]}
    assert "bass-guitar" in roles_by_id
    assert "lead-vocal" in roles_by_id
    assert "keys-right" in roles_by_id
    assert roles_by_id["lead-vocal"]["roleType"] == "vocal"

    intro_graph = intro_topology["part_graph"]
    graph_by_role = {n["role_id"]: n for n in intro_graph}

    # Check handoff relation
    assert "lead-vocal" in graph_by_role["bass-guitar"]["handoff_to"]
    assert "bass-guitar" in graph_by_role["lead-vocal"]["handoff_from"]

    # Check verse-1 section (only bass)
    verse_topology = result["topologies"][1]
    assert verse_topology["section_id"] == "verse-1"
    assert len(verse_topology["active_roles"]) == 1
    assert verse_topology["active_roles"][0]["id"] == "bass-guitar"
    assert verse_topology["active_roles"][0]["roleType"] == "instrument"
    assert verse_topology["active_roles"][0]["rehearsalPriority"] == "high"

    verse_graph = verse_topology["part_graph"]
    assert len(verse_graph) == 1
    assert verse_graph[0]["role_id"] == "bass-guitar"
    assert verse_graph[0]["handoff_to"] == []


def test_role_extractor_empty():
    """Test extractor with empty sections list."""
    extractor = RoleExtractor()
    result = extractor.extract([])
    assert result["topologies"] == []
