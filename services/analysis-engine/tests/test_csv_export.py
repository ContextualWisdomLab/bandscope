"""Tests for the CSV cue-sheet export builder."""

from __future__ import annotations

import csv
import io

from bandscope_analysis.exports import build_csv_text


class TestCSVExport:
    """Tests for ``build_csv_text``."""

    def test_build_csv_text_success(self) -> None:
        """Valid inputs produce correct CSV text."""
        song = {
            "title": "Test Song",
            "sections": [
                {
                    "label": "intro",
                    "timeRange": {"start": 0, "end": 10},
                    "roles": [
                        {
                            "id": "role1",
                            "name": "Guitar",
                            "cue": {"value": "Play riff"},
                        },
                        {
                            "id": "role2",
                            "name": "Bass",
                            "cue": {"value": "Root notes"},
                        },
                    ],
                    "partGraph": [
                        {"role_id": "role1", "is_active": True},
                        {"role_id": "role2", "is_active": True},
                    ],
                }
            ],
        }

        csv_text = build_csv_text(song)
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)

        assert len(rows) == 2
        assert rows[0] == ["Section", "Start", "End", "Cue", "Roles"]
        assert rows[1] == ["intro", "00:00", "00:10", "Play riff; Root notes", "Guitar, Bass"]

    def test_build_csv_text_empty_input(self) -> None:
        """None or empty mapping yields a CSV with just headers."""
        csv_text_none = build_csv_text(None)
        csv_text_empty = build_csv_text({})

        expected = "Section,Start,End,Cue,Roles\r\n"
        assert csv_text_none == expected
        assert csv_text_empty == expected

    def test_build_csv_text_injection_mitigation(self) -> None:
        """Formula injection characters are escaped."""
        song = {
            "sections": [
                {
                    "label": "=cmd|' /C calc'!A0",
                    "timeRange": {"start": 5, "end": 15},
                    "roles": [
                        {
                            "id": "r1",
                            "name": "+hack",
                            "cue": {"value": "-injection"},
                        }
                    ],
                    "partGraph": [
                        {"role_id": "r1", "is_active": True},
                    ],
                }
            ]
        }
        csv_text = build_csv_text(song)
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)

        assert len(rows) == 2
        assert rows[1][0] == "'=cmd|' /C calc'!A0"
        assert rows[1][3] == "'-injection"
        assert rows[1][4] == "'+hack"

    def test_build_csv_text_missing_time_range(self) -> None:
        """Sections without a valid time range are omitted."""
        song = {
            "sections": [
                {
                    "label": "intro",
                    "timeRange": "invalid",
                }
            ]
        }
        csv_text = build_csv_text(song)
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)

        assert len(rows) == 1
        assert rows[0] == ["Section", "Start", "End", "Cue", "Roles"]
