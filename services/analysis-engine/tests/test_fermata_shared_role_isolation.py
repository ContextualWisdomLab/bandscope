"""Regression tests for section-local fermata role mutation."""

from typing import Any

from bandscope_analysis.temporal.fermata import apply_fermata_plan


def _beats_with_fermata() -> list[float]:
    """Return beat times with one isolated extra hold after a steady 80 BPM pulse."""
    beats = [index * 0.75 for index in range(16)]
    beats.append(beats[-1] + 1.75)
    for _ in range(8):
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
        super().__init__(_section("verse-changing", 8, 20, initial_role))
        self._roles_reads = 0
        self._replacement = replacement

    def get(self, key: str, default: Any = None) -> Any:
        """Return a different roles payload after the landing role is selected."""
        if key == "roles":
            self._roles_reads += 1
            if self._roles_reads > 1:
                return self._replacement
        return super().get(key, default)


def test_fermata_stamp_does_not_leak_through_a_shared_role_object() -> None:
    """Only the section containing the hold receives the owned plan copy."""
    shared_role = _shared_vocal()
    earlier = _section("verse-1", 0, 8, shared_role)
    containing = _section("verse-2", 8, 20, shared_role)
    song = {"id": "shared-role-song", "title": "Shared Role", "sections": [earlier, containing]}

    apply_fermata_plan(song, _beats_with_fermata())

    assert "fermataPlan" not in earlier["roles"][0]
    assert containing["roles"][0]["fermataPlanSource"] == "model"


def test_fermata_stamp_fails_closed_if_roles_stop_being_a_list() -> None:
    """A runtime section that changes shape after selection receives no stamp."""
    role = _shared_vocal()
    section = _ChangingRolesSection(role, "not-a-role-list")
    song = {"id": "changing-song", "title": "Changing", "sections": [section]}

    apply_fermata_plan(song, _beats_with_fermata())

    assert "fermataPlan" not in role


def test_fermata_stamp_fails_closed_if_selected_role_identity_disappears() -> None:
    """A replaced roles list cannot receive a stamp through stale object identity."""
    role = _shared_vocal()
    replacement_role = dict(role)
    section = _ChangingRolesSection(role, [replacement_role])
    song = {"id": "drifting-song", "title": "Drifting", "sections": [section]}

    apply_fermata_plan(song, _beats_with_fermata())

    assert "fermataPlan" not in role
    assert "fermataPlan" not in replacement_role
