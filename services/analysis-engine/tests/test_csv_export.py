"""Tests for CSV export builder and formula injection prevention."""

from __future__ import annotations

import csv
import io
from typing import Any

import pytest

from bandscope_analysis.exports.csv import build_cue_sheet_csv, escape_csv_field


def _demo_song() -> dict[str, Any]:
    """Return a valid RehearsalSong payload for testing CSV export."""
    return {
        "id": "song-demo",
        "title": "CSV Demo",
        "sections": [
            {
                "label": "intro",
                "timeRange": {"start": 0, "end": 10},
                "roles": [
                    {
                        "id": "drums",
                        "name": "Drums",
                        "cue": {"kind": "entrance", "value": "Count in"},
                    }
                ],
                "partGraph": [{"role_id": "drums", "is_active": True}],
            },
            {
                "label": "verse",
                "timeRange": {"start": 10, "end": 30},
                "roles": [
                    {
                        "id": "bass",
                        "name": "Bass",
                        "cue": {"kind": "transition", "value": "Walk up"},
                    }
                ],
                "partGraph": [{"role_id": "bass", "is_active": True}],
            },
        ],
    }


class TestEscapeCsvField:
    """CSV formula injection prevention mitigates spreadsheet-sensitive prefixes."""

    @pytest.mark.parametrize("value", ["Hello World", "1234", " drums ", "   "])
    def test_normal_text_is_unchanged(self, value: str) -> None:
        """Normal text and harmless whitespace-only fields are returned unchanged."""
        assert escape_csv_field(value) == value

    def test_empty_string_is_unchanged(self) -> None:
        """Empty string is handled safely."""
        assert escape_csv_field("") == ""

    @pytest.mark.parametrize(
        "value",
        [
            "=1+2",
            "+SUM(A1)",
            "-100",
            "@cmd",
            "＝1+2",
            "＋SUM(A1)",
            "－100",
            "＠cmd",
            "  =SUM(A1)",
            " \t@cmd",
            "\tplain",
            "\rplain",
            "\nplain",
        ],
    )
    def test_spreadsheet_sensitive_prefixes_are_escaped(self, value: str) -> None:
        """ASCII, full-width, control, and whitespace-obscured prefixes fail closed."""
        assert escape_csv_field(value) == f"'{value}"

    def test_injection_characters_not_at_start_are_unchanged(self) -> None:
        """Problematic characters inside ordinary text are left unchanged."""
        assert escape_csv_field("Hello=World") == "Hello=World"
        assert escape_csv_field("100-200") == "100-200"
        assert escape_csv_field("user@email.com") == "user@email.com"


class TestBuildCueSheetCsv:
    """CSV export returns a valid formatted string."""

    def test_csv_builds_correctly(self) -> None:
        """A valid song produces a CSV with headers and rows."""
        csv_out = build_cue_sheet_csv(_demo_song())
        lines = csv_out.strip().split("\n")
        assert len(lines) == 3
        assert lines[0] == "Section,Start,End,Cue,Roles"

        reader = csv.reader(io.StringIO(csv_out))
        rows = list(reader)
        assert rows[1] == ["intro", "00:00", "00:10", "Count in", "Drums"]
        assert rows[2] == ["verse", "00:10", "00:30", "Walk up", "Bass"]

    def test_formula_injection_mitigated_in_csv(self) -> None:
        """Malicious section, cue, and role text remains one neutralized CSV cell each."""
        song = _demo_song()
        song["sections"][0]["label"] = "=cmd|' /C calc'!A0"
        song["sections"][0]["roles"][0]["cue"]["value"] = "+SUM(A1:A10)"
        song["sections"][0]["roles"][0]["name"] = "@role,=neighbor"

        csv_out = build_cue_sheet_csv(song)
        rows = list(csv.reader(io.StringIO(csv_out)))

        assert rows[1][0] == "'=cmd|' /C calc'!A0"
        assert rows[1][3] == "'+SUM(A1:A10)"
        assert rows[1][4] == "'@role,=neighbor"
        assert len(rows[1]) == 5

    def test_control_and_full_width_prefixes_are_neutralized_in_csv(self) -> None:
        """OWASP-documented control and locale-sensitive prefixes are neutralized."""
        song = _demo_song()
        song["sections"][0]["label"] = "＠localized"
        song["sections"][0]["roles"][0]["cue"]["value"] = "\tplain"

        rows = list(csv.reader(io.StringIO(build_cue_sheet_csv(song))))

        assert rows[1][0] == "'＠localized"
        assert rows[1][3] == "'\tplain"

    def test_safe_failure_for_none_and_empty(self) -> None:
        """None or empty mapping yields empty string without exception."""
        assert build_cue_sheet_csv(None) == ""
        assert build_cue_sheet_csv({}) == ""

    def test_no_rows_yields_empty_string(self) -> None:
        """Songs with no valid sections yield empty string, not just headers."""
        song = _demo_song()
        song["sections"] = []
        assert build_cue_sheet_csv(song) == ""
