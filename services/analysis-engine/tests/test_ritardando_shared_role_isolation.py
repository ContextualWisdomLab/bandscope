"""Regression tests for section-local ritardando role mutation."""

from typing import Any

from bandscope_analysis.temporal.ritardando import apply_ritardando_plan


def _beats_120_to_80() -> list[float]:
    """Return beat times that slow from 120 BPM to 80 BPM around 7.5 seconds."""
    beats = [index * 0.5 for index in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.75)
    return beats


def _shared_vocal() -> dict[str, Any]:
    """Return one role object deliberately shared by two section fixtures."""
    return {
        "id": "lead-vocal",
        "name": "Lead Vocal",
        "roleType": "vocal",
        "rehearsalPriority": "high",
    }


def _section(section_id: str, start: int, end: int, role: dict[str, Any]) -> dict[str, Any]:
    """Return a minimal section containing the supplied shared role object."""
    return {
        "id": section_id,
        "label": "verse",
        "timeRange": {"start": start, "end": end},
        "roles": [role],
        "partGraph": [
            {
                "role_id": "lead-vocal",
                "is_active": True,
                "handoff_to": [],
                "handoff_from": [],
            }
        ],
    }


def test_ritardando_stamp_does_not_leak_through_a_shared_role_object() -> None:
    """Only the section containing the tempo change receives the owned plan copy."""
    shared_role = _shared_vocal()
    earlier = _section("verse-1", 0, 4, shared_role)
    containing = _section("verse-2", 4, 16, shared_role)
    song = {"id": "shared-role-song", "title": "Shared Role", "sections": [earlier, containing]}

    apply_ritardando_plan(song, _beats_120_to_80())

    assert "ritardandoPlan" not in earlier["roles"][0]
    assert containing["roles"][0]["ritardandoPlanSource"] == "model"
