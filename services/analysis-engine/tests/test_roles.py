"""Tests for the role extraction and part graph models."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.roles.extractor import RoleExtractor
from bandscope_analysis.roles.model import (
    CueAnchorKind,
    RehearsalPriority,
    RoleType,
)
from bandscope_analysis.roles.overlap import band_energy_profile


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
    assert roles_by_id["lead-vocal"]["overlapWarnings"] == []

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
    assert verse_topology["active_roles"][0]["rehearsalPriority"] == "medium"
    assert verse_topology["active_roles"][0]["overlapWarnings"] == []

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


def _tone(freq: float, seconds: float, sr: int) -> np.ndarray:
    """Build a deterministic mono sine used as a known-register fixture.

    Args:
        freq: Tone frequency in Hz.
        seconds: Duration of the tone.
        sr: Sample rate in Hz.

    Returns:
        Mono float64 sine wave of the requested duration.
    """
    sample_count = int(sr * seconds)
    timeline = np.arange(sample_count, dtype=np.float64) / sr
    return np.sin(2.0 * np.pi * freq * timeline)


def test_role_extractor_uses_measured_register_overlap_per_section() -> None:
    """Measured low-register clash appears only in the section that contains it."""
    extractor = RoleExtractor()
    sample_rate = 22_050
    crowded = _tone(80.0, 1.0, sample_rate)
    separated = _tone(1000.0, 1.0, sample_rate)
    audio_features = {
        "stems": {
            "bass": np.concatenate([crowded, crowded]),
            "other": np.concatenate([crowded, separated]),
        },
        "sr": sample_rate,
        "boundaries": [(0.0, 1.0), (1.0, 2.0)],
    }

    verse_profile = band_energy_profile(crowded, sample_rate)
    chorus_profile = band_energy_profile(separated, sample_rate)
    ideal_low = {"low": 1.0, "mid": 0.0, "high": 0.0}
    ideal_mid = {"low": 0.0, "mid": 1.0, "high": 0.0}
    verse_rmse = (
        sum((verse_profile[band] - ideal_low[band]) ** 2 for band in ideal_low) / 3
    ) ** 0.5
    chorus_rmse = (
        sum((chorus_profile[band] - ideal_mid[band]) ** 2 for band in ideal_mid) / 3
    ) ** 0.5
    assert verse_rmse < 1e-6
    assert chorus_rmse < 1e-6

    result = extractor.extract([{"id": "verse-1"}, {"id": "chorus-1"}], audio_features)

    verse_roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}
    chorus_roles = {role["id"]: role for role in result["topologies"][1]["active_roles"]}

    expected = (
        "The low register is crowded between Bass Guitar and accompaniment. "
        "Thin one part in this section so players can hear their cue."
    )
    assert verse_roles["bass-guitar"]["overlapWarnings"] == [expected]
    assert verse_roles["keys-left"]["overlapWarnings"] == []
    assert verse_roles["keys-right"]["overlapWarnings"] == []
    assert verse_roles["acoustic-guitar"]["overlapWarnings"] == []
    assert chorus_roles["bass-guitar"]["overlapWarnings"] == []
    assert chorus_roles["keys-left"]["overlapWarnings"] == []


def test_role_extractor_omits_warnings_when_section_windows_are_missing() -> None:
    """Stems without matching section windows must not emit a song-wide clash."""
    extractor = RoleExtractor()
    sample_rate = 22_050
    crowded = _tone(80.0, 1.0, sample_rate)
    audio_features = {
        "stems": {"bass": crowded, "other": crowded.copy()},
        "sr": sample_rate,
    }

    result = extractor.extract([{"id": "verse-1"}, {"id": "chorus-1"}], audio_features)

    assert all(
        role["overlapWarnings"] == []
        for topology in result["topologies"]
        for role in topology["active_roles"]
    )


def test_role_extractor_omits_warnings_when_boundary_count_mismatches_sections() -> None:
    """A partial boundary list is not enough evidence to measure any section."""
    extractor = RoleExtractor()
    sample_rate = 22_050
    crowded = _tone(80.0, 2.0, sample_rate)
    audio_features = {
        "stems": {"bass": crowded, "other": crowded.copy()},
        "sr": sample_rate,
        "boundaries": [(0.0, 1.0)],
    }

    result = extractor.extract([{"id": "verse-1"}, {"id": "chorus-1"}], audio_features)

    assert all(
        role["overlapWarnings"] == []
        for topology in result["topologies"]
        for role in topology["active_roles"]
    )


def test_role_extractor_keeps_mixed_vocal_overlap_off_named_accompaniment_roles() -> None:
    """other + vocals may warn lead vocal only; keyboard identity stays unclaimed."""
    extractor = RoleExtractor()
    sample_rate = 22_050
    mid_tone = _tone(1000.0, 1.0, sample_rate)
    audio_features = {
        "stems": {"vocals": mid_tone, "other": mid_tone.copy()},
        "sr": sample_rate,
        "boundaries": [(0.0, 1.0)],
    }

    result = extractor.extract([{"id": "chorus-1"}], audio_features)
    roles = {role["id"]: role for role in result["topologies"][0]["active_roles"]}

    expected = (
        "The mid register is crowded between accompaniment and Lead Vocal. "
        "Thin one part in this section so players can hear their cue."
    )
    assert roles["lead-vocal"]["overlapWarnings"] == [expected]
    assert roles["keys-left"]["overlapWarnings"] == []
    assert roles["keys-right"]["overlapWarnings"] == []
    assert roles["acoustic-guitar"]["overlapWarnings"] == []


def test_role_extractor_omits_warnings_when_overlap_mapping_fails() -> None:
    """Overlap mapping failures must not invent density copy or abort extraction."""
    extractor = RoleExtractor()
    audio_features = {
        "stems": {"bass": _tone(80.0, 0.5, 22_050), "other": _tone(80.0, 0.5, 22_050)},
        "sr": 22_050,
        "boundaries": [(0.0, 0.5)],
    }

    with patch(
        "bandscope_analysis.roles.extractor.detect_register_overlap",
        side_effect=RuntimeError("overlap mapping exploded"),
    ):
        result = extractor.extract([{"id": "verse-1"}], audio_features)

    assert result["topologies"][0]["active_roles"]
    assert all(role["overlapWarnings"] == [] for role in result["topologies"][0]["active_roles"])
