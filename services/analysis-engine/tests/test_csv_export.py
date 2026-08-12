"""Tests for CSV export builder and formula injection prevention."""

from __future__ import annotations

import csv
import io
from typing import Any

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
    """CSV formula injection prevention mitigates problematic characters."""

    def test_normal_text_is_unchanged(self) -> None:
        """Normal string fields are returned unchanged."""
        assert escape_csv_field("Hello World") == "Hello World"
        assert escape_csv_field("1234") == "1234"
        assert escape_csv_field(" drums ") == " drums "

    def test_empty_string_is_unchanged(self) -> None:
        """Empty string is handled safely."""
        assert escape_csv_field("") == ""

    def test_formula_injection_characters_are_escaped(self) -> None:
        """Fields starting with =, +, -, @ are prefixed with a single quote."""
        assert escape_csv_field("=1+2") == "'=1+2"
        assert escape_csv_field("+SUM(A1)") == "'+SUM(A1)"
        assert escape_csv_field("-100") == "'-100"
        assert escape_csv_field("@cmd") == "'@cmd"
        assert escape_csv_field("\t=1+2") == "'\t=1+2"
        assert escape_csv_field("\r=1+2") == "'\r=1+2"
        assert escape_csv_field("\n=1+2") == "'\n=1+2"
        assert escape_csv_field("\x00=1+2") == "'\x00=1+2"

    def test_injection_characters_not_at_start_are_unchanged(self) -> None:
        """Problematic characters inside the string are left unchanged."""
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

        # Check header
        assert lines[0] == "Section,Start,End,Cue,Roles"

        # Check rows
        reader = csv.reader(io.StringIO(csv_out))
        rows = list(reader)
        assert rows[1] == ["intro", "00:00", "00:10", "Count in", "Drums"]
        assert rows[2] == ["verse", "00:10", "00:30", "Walk up", "Bass"]

    def test_formula_injection_mitigated_in_csv(self) -> None:
        """Malicious cues and roles in the song are safely escaped."""
        song = _demo_song()
        # Inject malicious cues and section names
        song["sections"][0]["label"] = "=cmd|' /C calc'!A0"
        song["sections"][0]["roles"][0]["cue"]["value"] = "+SUM(A1:A10)"
        song["sections"][0]["roles"][0]["name"] = "@role"

        csv_out = build_cue_sheet_csv(song)
        reader = csv.reader(io.StringIO(csv_out))
        rows = list(reader)

        # Verify the single quote prefix is preserved in the CSV data
        assert rows[1][0] == "'=cmd|' /C calc'!A0"
        assert rows[1][3] == "'+SUM(A1:A10)"
        assert rows[1][4] == "'@role"

    def test_safe_failure_for_none_and_empty(self) -> None:
        """None or empty mapping yields empty string without exception."""
        assert build_cue_sheet_csv(None) == ""
        assert build_cue_sheet_csv({}) == ""

    def test_no_rows_yields_empty_string(self) -> None:
        """Songs with no valid sections yield empty string, not just headers."""
        song = _demo_song()
        song["sections"] = []
        assert build_cue_sheet_csv(song) == ""
