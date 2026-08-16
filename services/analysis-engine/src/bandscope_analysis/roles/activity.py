"""Stem activity detection per structural boundary.

Determines which stems (roles) are active within each detected section boundary
by analyzing energy levels in the separated audio stems.

Security Notes:
- Processes numpy arrays from stem separation; no file I/O or network access.
- All numpy operations are bounded by input array sizes.
- Fails closed with inactive stems or empty activity when detection is inconclusive.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Energy threshold relative to the stem's global RMS for considering it "active".
ACTIVITY_THRESHOLD = 0.05

# Canonical stem names matching the AudioStemSeparator output.
STEM_NAMES = ("vocals", "bass", "drums", "other")


def detect_stem_activity(
    stems: dict[str, NDArray[np.floating[Any]]],
    boundaries: list[tuple[float, float]],
    sr: int,
) -> list[dict[str, bool]]:
    """Detect which stems are active in each boundary segment.

    Args:
        stems: Dict mapping stem names to audio arrays.
        boundaries: List of (start_seconds, end_seconds) tuples.
        sr: Sample rate.

    Returns:
        List of dicts mapping stem name -> is_active boolean, one per boundary.
    """
    if not boundaries or not stems:
        return []

    # Compute global RMS for each stem to set relative threshold
    global_rms: dict[str, float] = {}
    for stem_name, audio in stems.items():
        if isinstance(audio, np.ndarray) and audio.size > 0:
            global_rms[stem_name] = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
        else:
            global_rms[stem_name] = 0.0

    activity_per_segment: list[dict[str, bool]] = []

    for start_sec, end_sec in boundaries:
        start_sample = int(start_sec * sr)
        end_sample = int(end_sec * sr)

        segment_activity: dict[str, bool] = {}

        for stem_name, audio in stems.items():
            if not isinstance(audio, np.ndarray) or audio.size == 0:
                segment_activity[stem_name] = False
                continue

            # Extract the segment region
            seg_start = min(start_sample, audio.size)
            seg_end = min(end_sample, audio.size)

            if seg_end <= seg_start:
                segment_activity[stem_name] = False
                continue

            segment = audio[seg_start:seg_end].astype(np.float64)
            segment_rms = float(np.sqrt(np.mean(segment**2)))

            # A stem is active if its segment energy exceeds threshold relative to global
            g_rms = global_rms.get(stem_name, 0.0)
            if g_rms > 0:
                is_active = (segment_rms / g_rms) > ACTIVITY_THRESHOLD
            else:
                is_active = segment_rms > 1e-6

            segment_activity[stem_name] = is_active

        activity_per_segment.append(segment_activity)

    return activity_per_segment


def map_stems_to_roles(stem_activity: dict[str, bool]) -> dict[str, bool]:
    """Map stem activity to role activity.

    The canonical stem->role mapping:
    - vocals -> lead-vocal
    - bass -> bass-guitar
    - drums -> (no dedicated role, contributes to groove detection)
    - other -> keys-right, keys-left, acoustic-guitar

    Args:
        stem_activity: Dict mapping stem names to active booleans.

    Returns:
        Dict mapping role IDs to active booleans.
    """
    vocals_active = stem_activity.get("vocals", False)
    bass_active = stem_activity.get("bass", False)
    other_active = stem_activity.get("other", False)

    return {
        "bass-guitar": bass_active,
        "keys-left": other_active,
        "keys-right": other_active,
        "lead-vocal": vocals_active,
        "acoustic-guitar": other_active,
    }


def compute_handoffs(
    current_roles: dict[str, bool],
    next_roles: dict[str, bool] | None,
) -> dict[str, tuple[list[str], list[str]]]:
    """Compute handoff_to and handoff_from for the current section's roles.

    A handoff occurs when a role becomes inactive in the next section and another
    role becomes active (or vice versa). This detects role transitions.

    Args:
        current_roles: Dict mapping role IDs to active status in current section.
        next_roles: Dict mapping role IDs to active status in next section (None if last).

    Returns:
        Dict mapping role_id to (handoff_to, handoff_from) lists.
    """
    handoffs: dict[str, tuple[list[str], list[str]]] = {}

    for role_id in current_roles:
        handoffs[role_id] = ([], [])

    if next_roles is None:
        return handoffs

    # Find roles that deactivate in the next section
    deactivating = [r for r in current_roles if current_roles[r] and not next_roles.get(r, False)]
    # Find roles that activate in the next section
    activating = [r for r in next_roles if next_roles[r] and not current_roles.get(r, False)]

    # Every deactivating role comes from current_roles, so it is guaranteed to
    # have been initialized in handoffs above. Keeping a second membership test
    # only creates an unreachable branch and obscures the current-section output
    # invariant.
    for deact_role in deactivating:
        handoffs[deact_role] = (activating[:], handoffs[deact_role][1])

    # Roles that already existed but become active receive handoffs from roles
    # that deactivated. Roles introduced only in the next section are not part
    # of the current section's output mapping.
    for act_role in activating:
        if act_role in handoffs:
            handoffs[act_role] = (handoffs[act_role][0], deactivating[:])

    return handoffs