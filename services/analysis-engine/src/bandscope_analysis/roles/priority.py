"""Priority calculation for rehearsal roles."""

from __future__ import annotations

from .model import RehearsalPriority, RehearsalRole


def calculate_rehearsal_priority(role: RehearsalRole) -> RehearsalPriority:
    """Calculate the rehearsal priority for a role heuristically.

    A role gets high priority if:
    - It has low confidence
    - It has overlap warnings
    - It has manual overrides (indicating it was tricky enough for a human to edit)

    A role gets medium priority if:
    - It has medium confidence
    - It has a setup note or simplification suggestion

    Otherwise, it is low priority.

    Args:
        role: A dictionary representing a rehearsal role.

    Returns:
        The calculated RehearsalPriority.
    """
    confidence = role.get("confidence", {}).get("level", "high")
    overlap_warnings = role.get("overlapWarnings", [])
    manual_overrides = role.get("manualOverrides", [])

    if confidence == "low" or len(overlap_warnings) > 0 or len(manual_overrides) > 0:
        return RehearsalPriority.HIGH

    setup_note = role.get("setupNote", "")
    simplification = role.get("simplification", "")

    if confidence == "medium" or bool(setup_note) or bool(simplification):
        return RehearsalPriority.MEDIUM

    return RehearsalPriority.LOW
