"""Source separation logic for categorizing stems from roles."""

from __future__ import annotations

import logging
from typing import Any, Literal

from .model import SeparationResult, StemCategory, StemDescriptor

logger = logging.getLogger(__name__)

# Mapping of common role type keywords to stem categories.
_ROLE_TO_STEM: dict[str, StemCategory] = {
    "vocal": StemCategory.VOCALS,
    "bass": StemCategory.BASS,
    "drum": StemCategory.DRUMS,
    "keys": StemCategory.KEYS,
    "keyboard": StemCategory.KEYS,
    "piano": StemCategory.KEYS,
    "guitar": StemCategory.GUITAR,
}


def _categorize_role(role_id: str, role_name: str, role_type: str) -> StemCategory:
    """Determine the stem category for a role based on its metadata.

    Args:
        role_id: The role identifier.
        role_name: The human-readable role name.
        role_type: The role type (instrument, vocal, hand).

    Returns:
        The inferred StemCategory.
    """
    if role_type == "vocal":
        return StemCategory.VOCALS

    search_text = f"{role_id} {role_name}".lower()
    for keyword, category in _ROLE_TO_STEM.items():
        if keyword in search_text:
            return category

    return StemCategory.OTHER


class StemSeparator:
    """Categorizes roles into stem groups for source separation.

    Security Notes:
    - Processes untrusted input: role IDs, names, and role type strings.
    - Input validation: all values are coerced to str via str(); no eval or exec.
    - Safe failure: non-dict roles are skipped with a warning log.
    - Allowlist: role categorization uses a fixed keyword map (_ROLE_TO_STEM);
      unrecognized roles fall through to StemCategory.OTHER.
    - Trust boundary: role names and IDs are treated as opaque labels; they are
      stored but not interpreted or executed.
    """

    def __init__(self) -> None:
        """Initialize the stem separator."""
        pass

    def separate(
        self,
        roles: list[dict[str, Any]],
    ) -> SeparationResult:
        """Categorize roles into stem descriptors.

        Args:
            roles: List of role dicts with 'id', 'name', and 'roleType' fields.

        Returns:
            SeparationResult with stem descriptors and notes.
        """
        stems: list[StemDescriptor] = []
        seen_ids: set[str] = set()

        for i, role in enumerate(roles):
            if not isinstance(role, dict):
                logger.warning(
                    "Invalid role format at index %d; expected dict, got %s",
                    i,
                    type(role).__name__,
                )
                continue

            role_id = str(role.get("id", f"role-{i}"))
            if role_id in seen_ids:
                continue
            seen_ids.add(role_id)

            role_name = str(role.get("name", ""))
            role_type = str(role.get("roleType", ""))
            category = _categorize_role(role_id, role_name, role_type)

            # Confidence based on role type specificity
            confidence: Literal["low", "medium", "high"] = (
                "high" if role_type in ("vocal", "instrument") else "medium"
            )

            stems.append(
                {
                    "stem_id": f"stem-{role_id}",
                    "category": category.value,
                    "label": role_name or role_id,
                    "confidence": confidence,
                }
            )

        return {
            "stems": stems,
            "separation_notes": f"Categorized {len(stems)} roles into stems.",
        }
