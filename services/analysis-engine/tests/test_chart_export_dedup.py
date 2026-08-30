"""Regression tests for order-preserving chart export de-duplication."""

from typing import Any

from bandscope_analysis.exports import build_chart_text, build_cue_sheet_rows


def _role(role_id: str, name: str, cue: str, priority: str = "") -> dict[str, Any]:
    """Build the minimal role evidence consumed by the chart export boundary."""
    return {
        "id": role_id,
        "name": name,
        "cue": {"kind": "entrance", "value": cue},
        "rehearsalPriority": priority,
    }


def _section(
    section_id: str,
    label: str,
    start: int,
    end: int,
    roles: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a valid section whose part graph activates roles in list order."""
    return {
        "id": section_id,
        "label": label,
        "timeRange": {"start": start, "end": end},
        "roles": roles,
        "partGraph": [
            {"role_id": role["id"], "is_active": True} for role in roles
        ],
    }


def test_duplicate_display_names_and_cues_keep_first_occurrence_order() -> None:
    """Distinct role ids may share display/cue text without duplicating export output."""
    section = _section(
        "verse",
        "verse",
        0,
        16,
        [
            _role("guitar-left", "Guitar", "Count in"),
            _role("guitar-right", "Guitar", "Count in"),
            _role("bass", "Bass", "Hold root"),
            _role("guitar-double", "Guitar", "Count in"),
        ],
    )

    rows = build_cue_sheet_rows({"sections": [section]})

    assert rows == [
        {
            "section": "verse",
            "start": "00:00",
            "end": "00:16",
            "cue": "Count in; Hold root",
            "roles": ["Guitar", "Bass"],
        }
    ]


def test_duplicate_priorities_across_sections_keep_first_occurrence_order() -> None:
    """Repeated name/priority entries collapse once without reordering later entries."""
    song = {
        "title": "Order regression",
        "sections": [
            _section(
                "verse",
                "verse",
                0,
                16,
                [
                    _role("guitar", "Guitar", "Count in", "Lock chorus"),
                    _role("bass", "Bass", "Hold root", "Watch cutoff"),
                ],
            ),
            _section(
                "chorus",
                "chorus",
                16,
                32,
                [
                    _role("guitar-2", "Guitar", "Count in", "Lock chorus"),
                    _role("bass-2", "Bass", "Hold root", "Watch cutoff"),
                ],
            ),
        ],
    }

    text = build_chart_text(song)
    priority_lines = text.split("Priorities:\n", maxsplit=1)[1].splitlines()

    assert priority_lines == [
        "  - Guitar: Lock chorus",
        "  - Bass: Watch cutoff",
    ]
