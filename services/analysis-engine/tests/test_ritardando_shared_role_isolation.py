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


class _ChangingRolesSection(dict[str, Any]):
    """Section mapping that changes its roles collection after selection."""

    def __init__(self, initial_role: dict[str, Any], replacement: object) -> None:
        """Store a valid first roles read and the later replacement value."""
        super().__init__(_section("verse-changing", 4, 16, initial_role))
        self._roles_reads = 0
        self._replacement = replacement

    def get(self, key: str, default: Any = None) -> Any:
        """Return a different roles payload after the landing role is selected."""
        if key == "roles":
            self._roles_reads += 1
            if self._roles_reads > 1:
                return self._replacement
        return super().get(key, default)


def test_ritardando_stamp_does_not_leak_through_a_shared_role_object() -> None:
    """Only the section containing the tempo change receives the owned plan copy."""
    shared_role = _shared_vocal()
    earlier = _section("verse-1", 0, 4, shared_role)
    containing = _section("verse-2", 4, 16, shared_role)
    song = {"id": "shared-role-song", "title": "Shared Role", "sections": [earlier, containing]}

    apply_ritardando_plan(song, _beats_120_to_80())

    assert "ritardandoPlan" not in earlier["roles"][0]
    assert containing["roles"][0]["ritardandoPlanSource"] == "model"


def test_ritardando_stamp_fails_closed_if_roles_stop_being_a_list() -> None:
    """A runtime section that changes shape after selection receives no stamp."""
    role = _shared_vocal()
    section = _ChangingRolesSection(role, "not-a-role-list")
    song = {"id": "changing-song", "title": "Changing", "sections": [section]}

    apply_ritardando_plan(song, _beats_120_to_80())

    assert "ritardandoPlan" not in role


def test_ritardando_stamp_fails_closed_if_selected_role_identity_disappears() -> None:
    """A replaced roles list cannot receive a stamp through stale object identity."""
    role = _shared_vocal()
    replacement_role = dict(role)
    replacement_roles = [replacement_role]
    section = _ChangingRolesSection(role, replacement_roles)
    song = {"id": "drifting-song", "title": "Drifting", "sections": [section]}

    apply_ritardando_plan(song, _beats_120_to_80())

    assert "ritardandoPlan" not in role
    assert "ritardandoPlan" not in replacement_role
