"""Tests for the chart-style cue-sheet export builders."""

import json
from typing import Any

from bandscope_analysis.exports import build_chart_text, build_cue_sheet_rows


def _role(
    role_id: str,
    name: str,
    cue_value: str,
    priority: str = "",
) -> dict[str, Any]:
    """Build a role payload matching the api.py RehearsalRolePayload shape."""
    return {
        "id": role_id,
        "name": name,
        "roleType": role_id,
        "harmony": {"chord": "Am", "functionLabel": "i", "source": "model"},
        "cue": {"kind": "entrance", "value": cue_value},
        "range": {"lowestNote": "E2", "highestNote": "G4"},
        "confidence": {"level": "high", "source": "model", "notes": ""},
        "rehearsalPriority": priority,
        "simplification": "",
        "setupNote": "",
        "manualOverrides": [],
        "overlapWarnings": [],
    }


def _demo_song() -> dict[str, Any]:
    """Build a song payload matching the shape built by api.py."""
    return {
        "id": "demo-song",
        "title": "Late Night Set",
        "bpm": 92,
        "key": "A minor",
        "feel": "Straight eighths with a late snare feel",
        "sections": [
            {
                "id": "section-verse",
                "label": "verse",
                "groove": "Straight eighths with a late snare feel",
                "timeRange": {"start": 10, "end": 30},
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Double-check the pickup into the chorus.",
                },
                "roles": [
                    _role("drums", "Drums", "Four-count into the verse", "Lock the hi-hat"),
                    _role("bass", "Bass", "Enter on the downbeat"),
                    _role("keys", "Keys", "Lay out until the chorus"),
                ],
                "partGraph": [
                    {
                        "role_id": "drums",
                        "is_active": True,
                        "handoff_to": ["bass"],
                        "handoff_from": [],
                    },
                    {
                        "role_id": "bass",
                        "is_active": True,
                        "handoff_to": [],
                        "handoff_from": ["drums"],
                    },
                    {
                        "role_id": "keys",
                        "is_active": False,
                        "handoff_to": [],
                        "handoff_from": [],
                    },
                ],
            },
            {
                "id": "section-chorus",
                "label": "chorus",
                "groove": "Driving eighths",
                "timeRange": {"start": 75, "end": 105},
                "confidence": {"level": "high", "source": "model", "notes": ""},
                "roles": [_role("drums", "Drums", "Crash into the chorus")],
                "partGraph": [
                    {
                        "role_id": "drums",
                        "is_active": True,
                        "handoff_to": [],
                        "handoff_from": [],
                    }
                ],
            },
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Focus on verse-to-chorus transitions and entrances.",
            "focusSections": ["verse", "chorus"],
        },
    }


class TestBuildChartText:
    """Chart text covers header, section lines, footer, and determinism."""

    def test_contains_section_labels_times_and_active_roles(self) -> None:
        """The chart lists each section with mm:ss times and active roles."""
        text = build_chart_text(_demo_song())
        assert "[00:10-00:30] VERSE  (medium)  roles: Drums, Bass" in text
        assert "[01:15-01:45] CHORUS  (high)  roles: Drums" in text

    def test_inactive_roles_are_excluded_from_section_lines(self) -> None:
        """Roles flagged inactive in the part graph do not appear as active."""
        text = build_chart_text(_demo_song())
        assert "roles: Drums, Bass" in text
        assert "Keys" not in text.split("Priorities:")[0]

    def test_header_includes_title_and_optional_fields(self) -> None:
        """Title, BPM, key, and feel appear when present in the payload."""
        text = build_chart_text(_demo_song())
        assert "Late Night Set" in text
        assert "BPM: 92" in text
        assert "Key: A minor" in text
        assert "Feel: Straight eighths with a late snare feel" in text

    def test_missing_header_fields_are_omitted_not_invented(self) -> None:
        """Absent BPM/key/feel produce no header lines for those fields."""
        song = _demo_song()
        del song["bpm"]
        del song["key"]
        del song["feel"]
        text = build_chart_text(song)
        assert "BPM:" not in text
        assert "Key:" not in text
        assert "Feel:" not in text

    def test_boolean_header_values_are_not_rendered(self) -> None:
        """Boolean values are not treated as numeric header fields."""
        song = _demo_song()
        song["bpm"] = True
        assert "BPM:" not in build_chart_text(song)

    def test_footer_lists_priorities_and_focus(self) -> None:
        """Role rehearsal priorities and the export headline form the footer."""
        text = build_chart_text(_demo_song())
        assert "Priorities:" in text
        assert "  - Drums: Lock the hi-hat" in text
        assert "Focus: Focus on verse-to-chorus transitions and entrances." in text

    def test_footer_omitted_when_no_priorities_or_summary(self) -> None:
        """No footer lines appear without priorities or an export summary."""
        song = _demo_song()
        for section in song["sections"]:
            for role in section["roles"]:
                role["rehearsalPriority"] = ""
        song["exportSummary"] = "not-a-mapping"
        text = build_chart_text(song)
        assert "Priorities:" not in text
        assert "Focus:" not in text

    def test_deterministic_output(self) -> None:
        """Two builds from equal payloads produce identical text."""
        assert build_chart_text(_demo_song()) == build_chart_text(_demo_song())

    def test_missing_title_is_skipped(self) -> None:
        """A song without a title still renders section lines."""
        song = _demo_song()
        del song["title"]
        text = build_chart_text(song)
        assert "Late Night Set" not in text
        assert "VERSE" in text

    def test_missing_confidence_omits_parenthetical(self) -> None:
        """Sections without confidence render without a level marker."""
        song = _demo_song()
        del song["sections"][0]["confidence"]
        text = build_chart_text(song)
        assert "[00:10-00:30] VERSE  roles: Drums, Bass" in text

    def test_blank_confidence_level_omits_parenthetical(self) -> None:
        """A confidence payload with an empty level renders no marker."""
        song = _demo_song()
        song["sections"][0]["confidence"] = {"level": "", "source": "model", "notes": ""}
        assert "[00:10-00:30] VERSE  roles: Drums, Bass" in build_chart_text(song)


class TestBuildCueSheetRows:
    """Cue rows carry mm:ss times, cues, and active role names."""

    def test_rows_have_mmss_times_cues_and_roles(self) -> None:
        """75s starts format as 01:15 and active roles are listed."""
        rows = build_cue_sheet_rows(_demo_song())
        assert rows == [
            {
                "section": "verse",
                "start": "00:10",
                "end": "00:30",
                "cue": "Four-count into the verse; Enter on the downbeat",
                "roles": ["Drums", "Bass"],
            },
            {
                "section": "chorus",
                "start": "01:15",
                "end": "01:45",
                "cue": "Crash into the chorus",
                "roles": ["Drums"],
            },
        ]

    def test_missing_part_graph_falls_back_to_roles_list(self) -> None:
        """Without a part graph, every role in the roles list is active."""
        song = _demo_song()
        del song["sections"][0]["partGraph"]
        rows = build_cue_sheet_rows(song)
        assert rows[0]["roles"] == ["Drums", "Bass", "Keys"]

    def test_active_graph_node_without_role_payload_keeps_role_id(self) -> None:
        """An active node with no matching role payload uses its role_id."""
        song = _demo_song()
        song["sections"][1]["partGraph"].append(
            {"role_id": "vox", "is_active": True, "handoff_to": [], "handoff_from": []}
        )
        rows = build_cue_sheet_rows(song)
        assert rows[1]["roles"] == ["Drums", "vox"]

    def test_role_without_name_falls_back_to_id(self) -> None:
        """A role payload missing its name uses its id as display name."""
        song = _demo_song()
        del song["sections"][1]["roles"][0]["name"]
        rows = build_cue_sheet_rows(song)
        assert rows[1]["roles"] == ["drums"]

    def test_role_without_name_or_id_is_skipped(self) -> None:
        """A role payload with neither name nor id contributes nothing."""
        song = _demo_song()
        section = song["sections"][1]
        del section["partGraph"]
        del section["roles"][0]["name"]
        del section["roles"][0]["id"]
        rows = build_cue_sheet_rows(song)
        assert rows[1]["roles"] == []

    def test_malformed_cue_payloads_are_skipped(self) -> None:
        """Non-mapping cues and empty cue values are skipped safely."""
        song = _demo_song()
        song["sections"][0]["roles"][0]["cue"] = "not-a-mapping"
        song["sections"][0]["roles"][1]["cue"] = {"kind": "entrance", "value": ""}
        rows = build_cue_sheet_rows(song)
        assert rows[0]["cue"] == ""

    def test_duplicate_role_ids_and_graph_nodes_are_deduplicated(self) -> None:
        """Duplicate ids in roles and the part graph collapse to one entry."""
        song = _demo_song()
        section = song["sections"][1]
        section["roles"].append(_role("drums", "Drums Copy", "Crash into the chorus"))
        section["partGraph"].append(
            {"role_id": "drums", "is_active": True, "handoff_to": [], "handoff_from": []}
        )
        rows = build_cue_sheet_rows(song)
        assert rows[1]["roles"] == ["Drums"]


class TestSafeFailure:
    """Malformed input degrades to empty output without exceptions."""

    def test_none_and_empty_song(self) -> None:
        """None and empty dict inputs yield empty outputs."""
        assert build_chart_text(None) == ""
        assert build_cue_sheet_rows(None) == []
        assert build_chart_text({}) == ""
        assert build_cue_sheet_rows({}) == []

    def test_non_mapping_song(self) -> None:
        """Non-mapping song payloads yield empty outputs."""
        assert build_chart_text(["not", "a", "song"]) == ""  # type: ignore[arg-type]
        assert build_cue_sheet_rows("song") == []  # type: ignore[arg-type]

    def test_sections_not_a_list(self) -> None:
        """A non-list sections field is treated as no sections."""
        song = _demo_song()
        song["sections"] = "not-a-list"
        assert build_cue_sheet_rows(song) == []

    def test_non_mapping_section_entries_are_skipped(self) -> None:
        """Non-mapping entries in the sections list are skipped."""
        song = _demo_song()
        song["sections"].insert(0, "not-a-section")
        rows = build_cue_sheet_rows(song)
        assert [row["section"] for row in rows] == ["verse", "chorus"]

    def test_section_missing_time_range_is_skipped(self) -> None:
        """A section without a timeRange is skipped without crashing."""
        song = _demo_song()
        del song["sections"][0]["timeRange"]
        rows = build_cue_sheet_rows(song)
        assert [row["section"] for row in rows] == ["chorus"]
        assert "VERSE" not in build_chart_text(song)

    def test_invalid_time_ranges_are_skipped(self) -> None:
        """Boolean, negative, and inverted time ranges are all rejected."""
        song = _demo_song()
        song["sections"][0]["timeRange"] = {"start": True, "end": 30}
        song["sections"][1]["timeRange"] = {"start": -5, "end": 30}
        song["sections"].append(dict(song["sections"][1], timeRange={"start": 30, "end": 10}))
        song["sections"].append(dict(song["sections"][1], timeRange={"start": 0, "end": False}))
        assert build_cue_sheet_rows(song) == []

    def test_section_missing_label_is_skipped(self) -> None:
        """A section without a label is skipped in text and rows."""
        song = _demo_song()
        del song["sections"][0]["label"]
        rows = build_cue_sheet_rows(song)
        assert [row["section"] for row in rows] == ["chorus"]

    def test_malformed_roles_and_part_graph_entries(self) -> None:
        """Non-mapping roles/nodes and blank role ids are skipped."""
        song = _demo_song()
        section = song["sections"][1]
        section["roles"] = "not-a-list"
        section["partGraph"] = [
            "not-a-node",
            {"role_id": "", "is_active": True},
            {"role_id": 7, "is_active": True},
            {"role_id": "drums", "is_active": True},
        ]
        rows = build_cue_sheet_rows(song)
        assert rows[1]["roles"] == ["drums"]


class TestNoPathLeakage:
    """Exports never emit filesystem paths from the payload."""

    def test_path_like_fields_never_reach_output(self) -> None:
        """Path-carrying fields on the song are never read into exports."""
        song = _demo_song()
        song["sourcePath"] = "/Users/someone/Music/secret-demo.wav"
        song["localSource"] = {"sourcePath": "/Users/someone/Music/secret-demo.wav"}
        text = build_chart_text(song)
        rows_json = json.dumps(build_cue_sheet_rows(song))
        assert "/Users" not in text
        assert "secret-demo" not in text
        assert "/Users" not in rows_json
        assert "secret-demo" not in rows_json


class TestOrderPreservingDeduplication:
    """Optimized de-duplication preserves the user-visible first-occurrence order."""

    def test_names_cues_and_priorities_keep_first_occurrence_order(self) -> None:
        """Separated duplicates collapse without reordering the remaining rehearsal data."""
        song = _demo_song()
        section = song["sections"][0]
        del section["partGraph"]
        section["roles"] = [
            _role("drums-a", "Drums", "Count in", "Tight pocket"),
            _role("bass", "Bass", "Enter", "Hold the root"),
            _role("drums-b", "Drums", "Count in", "Tight pocket"),
            _role("guitar", "Guitar", "Open up", "Leave space"),
        ]
        song["sections"] = [section]

        rows = build_cue_sheet_rows(song)
        assert rows[0]["roles"] == ["Drums", "Bass", "Guitar"]
        assert rows[0]["cue"] == "Count in; Enter; Open up"

        text = build_chart_text(song)
        priorities = text.split("Priorities:\n", 1)[1].split("\nFocus:", 1)[0].splitlines()
        assert priorities == [
            "  - Drums: Tight pocket",
            "  - Bass: Hold the root",
            "  - Guitar: Leave space",
        ]
