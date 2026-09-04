"""Regression contract for ordered chart-export de-duplication."""

from typing import Any

from bandscope_analysis.exports import build_chart_text, build_cue_sheet_rows


def _role(role_id: str, name: str, cue: str, priority: str) -> dict[str, Any]:
    """Build the minimum role shape consumed by the chart exporter."""
    return {
        "id": role_id,
        "name": name,
        "cue": {"kind": "entrance", "value": cue},
        "rehearsalPriority": priority,
    }


def _song() -> dict[str, Any]:
    """Build ordered duplicate values that must keep first-occurrence order."""
    return {
        "title": "Ordered Dedup Contract",
        "sections": [
            {
                "id": "section-1",
                "label": "verse",
                "timeRange": {"start": 0, "end": 16},
                "roles": [
                    _role("bass-main", "Bass", "Walk up", "high"),
                    _role("drums", "Drums", "Hit on 1", "medium"),
                    _role("bass-copy", "Bass", "Walk up", "high"),
                ],
                "partGraph": [
                    {"role_id": "bass-main", "is_active": True},
                    {"role_id": "drums", "is_active": True},
                    {"role_id": "bass-main", "is_active": True},
                    {"role_id": "bass-copy", "is_active": True},
                ],
            }
        ],
    }


def test_ordered_deduplication_preserves_first_occurrence_semantics() -> None:
    """Duplicate ids and display values collapse without reordering the chart."""
    rows = build_cue_sheet_rows(_song())
    assert rows == [
        {
            "section": "verse",
            "start": "00:00",
            "end": "00:16",
            "cue": "Walk up; Hit on 1",
            "roles": ["Bass", "Drums"],
        }
    ]

    text = build_chart_text(_song())
    priority_lines = [line for line in text.splitlines() if line.startswith("  - ")]
    assert priority_lines == ["  - Bass: high", "  - Drums: medium"]


def test_duplicate_role_ids_preserve_first_payload_and_graph_position() -> None:
    """Repeated role identities keep the first role payload and one active position."""
    song: dict[str, Any] = {
        "sections": [
            {
                "id": "section-1",
                "label": "verse",
                "timeRange": {"start": 0, "end": 16},
                "roles": [
                    _role("bass", "Bass", "Walk up", "high"),
                    _role("bass", "Bass Copy", "Late replacement", "low"),
                ],
                "partGraph": [
                    {"role_id": "bass", "is_active": True},
                    {"role_id": "bass", "is_active": True},
                ],
            }
        ]
    }

    rows = build_cue_sheet_rows(song)
    assert rows == [
        {
            "section": "verse",
            "start": "00:00",
            "end": "00:16",
            "cue": "Walk up",
            "roles": ["Bass"],
        }
    ]
