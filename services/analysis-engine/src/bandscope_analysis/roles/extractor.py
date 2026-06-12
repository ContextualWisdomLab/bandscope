"""Role extractor implementation."""

from __future__ import annotations

import logging
from typing import Any

from .model import (
    CueAnchorKind,
    PartGraphNode,
    RangeSummary,
    RehearsalPriority,
    RehearsalRole,
    RoleExtractionResult,
    RoleType,
    SectionRoleTopology,
)
from .priority import calculate_rehearsal_priority
from .tuning import get_setup_note

logger = logging.getLogger(__name__)


class RoleExtractor:
    """Extracts roles and builds the part graph for song sections."""

    def __init__(self) -> None:
        """Initialize the role extractor."""
        pass

    def extract(
        self,
        sections: list[Any],
        audio_features: dict[str, Any] | None = None,
    ) -> RoleExtractionResult:
        """Extract roles and their topology per section.

        Args:
            sections: List of section dicts (must contain 'id').
            audio_features: Optional audio features to inform extraction.

        Returns:
            RoleExtractionResult containing topologies and notes.
        """
        topologies: list[SectionRoleTopology] = []

        features = audio_features or {}
        stems = features.get("stems", {})
        sr = features.get("sr", 22050)

        vocal_range: RangeSummary = {"lowestNote": "G#3", "highestNote": "C#5"}
        vocal_chord = "C#m7"
        bass_range: RangeSummary = {"lowestNote": "C#2", "highestNote": "E3"}
        bass_chord = "C#m7"

        # If we have real audio stems, extract real ranges and chords
        if stems:
            try:
                from ..chords.chord_recognizer import ChordRecognizer
                from ..ranges.pitch_tracker import PitchTracker

                pitch_tracker = PitchTracker()
                chord_recognizer = ChordRecognizer()

                if "vocals" in stems:
                    p_res = pitch_tracker.track(stems["vocals"], sr=sr)
                    if p_res:
                        v_lowest = p_res.get("lowest_note")
                        v_highest = p_res.get("highest_note")
                        if v_lowest and v_highest:
                            vocal_range = {
                                "lowestNote": v_lowest,
                                "highestNote": v_highest,
                            }

                if "bass" in stems:
                    p_res = pitch_tracker.track(stems["bass"], sr=sr)
                    if p_res:
                        b_lowest = p_res.get("lowest_note")
                        b_highest = p_res.get("highest_note")
                        if b_lowest and b_highest:
                            bass_range = {
                                "lowestNote": b_lowest,
                                "highestNote": b_highest,
                            }
                    c_res = chord_recognizer.recognize(stems["bass"], sr=sr)
                    if c_res and len(c_res) > 0:
                        # Use the most common chord or first chord
                        valid_chords = [c["chord"] for c in c_res if c["chord"] != "N"]
                        if valid_chords:
                            bass_chord = valid_chords[0]

                if "other" in stems:
                    c_res = chord_recognizer.recognize(stems["other"], sr=sr)
                    if c_res and len(c_res) > 0:
                        valid_chords = [c["chord"] for c in c_res if c["chord"] != "N"]
                        if valid_chords:
                            vocal_chord = valid_chords[0]
            except Exception as e:
                logger.warning("Failed to extract features from stems: %s", e)

        # Simple mock implementation for testing/demonstration purposes
        for i, section in enumerate(sections):
            if not isinstance(section, dict):
                logger.warning(
                    "Invalid section format at index %d; expected dict, got %s",
                    i,
                    type(section).__name__,
                )
                section_id = f"section-{i}"
            else:
                section_id = section.get("id", f"section-{i}")

            bass_role: RehearsalRole = {
                "id": "bass-guitar",
                "name": "Bass Guitar",
                "roleType": RoleType.INSTRUMENT,
                "harmony": {
                    "chord": bass_chord,
                    "functionLabel": "vi pedal anchor",
                    "source": "model",
                },
                "cue": {
                    "kind": CueAnchorKind.TRANSITION,
                    "value": "Hold through the pickup before the downbeat.",
                },
                "range": bass_range,
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Watch the slide into the turnaround.",
                },
                "rehearsalPriority": RehearsalPriority.HIGH,  # to be replaced
                "simplification": "Stay on roots if the chorus entrance gets muddy.",
                "setupNote": get_setup_note("Bass Guitar", [bass_chord])
                or "Keep the attack short so the verse breathes.",
                "manualOverrides": [],
                "overlapWarnings": [
                    "Density warning: competing with Keyboard Left Hand in low register."
                ],
            }

            keys_left_role: RehearsalRole = {
                "id": "keys-left",
                "name": "Keyboard 1 Left Hand",
                "roleType": RoleType.HAND,
                "harmony": {
                    "chord": "C#",
                    "functionLabel": "Root reinforcement",
                    "source": "model",
                },
                "cue": {
                    "kind": CueAnchorKind.TRANSITION,
                    "value": "Lock in with bass pedal.",
                },
                "range": {"lowestNote": "C#2", "highestNote": "C#3"},
                "confidence": {
                    "level": "low",
                    "source": "model",
                    "notes": "Muddy frequency range, difficult to clearly separate from bass.",
                },
                "rehearsalPriority": RehearsalPriority.MEDIUM,  # to be replaced
                "simplification": "Omit if bass is covering the lower register.",
                "setupNote": get_setup_note("Keyboard", ["C#"])
                or "Use a darker patch to avoid clashing with right hand.",
                "manualOverrides": [],
                "overlapWarnings": ["Density warning: competing with Bass Guitar in low register."],
            }

            keys_role: RehearsalRole = {
                "id": "keys-right",
                "name": "Keyboard 1 Right Hand",
                "roleType": RoleType.HAND,
                "harmony": {
                    "chord": "Emaj7",
                    "functionLabel": "Imaj7 color",
                    "source": "model",
                },
                "cue": {
                    "kind": CueAnchorKind.COUNT,
                    "value": "Enter on beat 2 after the pickup.",
                },
                "range": {"lowestNote": "B3", "highestNote": "G#5"},
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Top note voicing may need a quick ear check.",
                },
                "rehearsalPriority": RehearsalPriority.HIGH,  # to be replaced
                "simplification": "Drop top extension if the chorus turnaround feels busy.",
                "setupNote": get_setup_note("Keyboard", ["Emaj7"])
                or "Keep the patch bright enough to stay over the guitars.",
                "manualOverrides": [],
                "overlapWarnings": ["Melodic overlap: top notes conflict with Lead Vocal range."],
            }

            vocal_role: RehearsalRole = {
                "id": "lead-vocal",
                "name": "Lead Vocal",
                "roleType": RoleType.VOCAL,
                "harmony": {
                    "chord": vocal_chord,
                    "functionLabel": "vi melodic pull",
                    "source": "model",
                },
                "cue": {"kind": CueAnchorKind.LYRIC, "value": "city lights"},
                "range": vocal_range,
                "confidence": {
                    "level": "high",
                    "source": "user",
                    "notes": "Singer confirmed the pickup phrasing in rehearsal notes.",
                },
                "rehearsalPriority": RehearsalPriority.MEDIUM,  # to be replaced
                "simplification": "Keep sustained note centered; skip ad-lib on first pass.",
                "setupNote": get_setup_note("Lead Vocal", [vocal_chord])
                or "Watch the breath before the last line of the verse.",
                "manualOverrides": [
                    {
                        "field": "harmony",
                        "value": {
                            "chord": "C#m11",
                            "functionLabel": "vi suspended lift",
                            "source": "user",
                        },
                        "source": "user",
                    }
                ],
                "overlapWarnings": ["Melodic overlap: competing with Keyboard 1 Right Hand."],
            }

            acoustic_guitar_role: RehearsalRole = {
                "id": "acoustic-guitar",
                "name": "Acoustic Guitar",
                "roleType": RoleType.INSTRUMENT,
                "harmony": {
                    "chord": "Eb",
                    "functionLabel": "I",
                    "source": "model",
                },
                "cue": {"kind": CueAnchorKind.TRANSITION, "value": "Strum on the downbeat."},
                "range": {"lowestNote": "E2", "highestNote": "C#5"},
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Standard open chords detected.",
                },
                "rehearsalPriority": RehearsalPriority.MEDIUM,
                "simplification": "Simplify strumming pattern if rushing.",
                "setupNote": get_setup_note("Acoustic Guitar", ["Eb", "Bb", "Fm", "Ab"])
                or "Check tuning.",
                "manualOverrides": [],
                "overlapWarnings": [],
            }

            for role in [bass_role, keys_left_role, keys_role, vocal_role, acoustic_guitar_role]:
                role["rehearsalPriority"] = calculate_rehearsal_priority(role)

            active_roles = [bass_role, acoustic_guitar_role]

            # Simple part graph for bass and guitar
            part_graph: list[PartGraphNode] = [
                {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []},
                {
                    "role_id": "acoustic-guitar",
                    "is_active": True,
                    "handoff_to": [],
                    "handoff_from": [],
                },
            ]

            if i == 0:
                active_roles.extend([keys_left_role, keys_role, vocal_role])
                part_graph.extend(
                    [
                        {
                            "role_id": "keys-left",
                            "is_active": True,
                            "handoff_to": [],
                            "handoff_from": [],
                        },
                        {
                            "role_id": "keys-right",
                            "is_active": True,
                            "handoff_to": [],
                            "handoff_from": [],
                        },
                        {
                            "role_id": "lead-vocal",
                            "is_active": True,
                            "handoff_to": [],
                            "handoff_from": [],
                        },
                    ]
                )
                for node in part_graph:
                    if node["role_id"] == "bass-guitar":
                        node["handoff_to"].append("lead-vocal")
                    elif node["role_id"] == "lead-vocal":
                        node["handoff_from"].append("bass-guitar")
            else:
                part_graph.extend(
                    [
                        {
                            "role_id": "keys-left",
                            "is_active": False,
                            "handoff_to": [],
                            "handoff_from": [],
                        },
                        {
                            "role_id": "keys-right",
                            "is_active": False,
                            "handoff_to": [],
                            "handoff_from": [],
                        },
                        {
                            "role_id": "lead-vocal",
                            "is_active": False,
                            "handoff_to": [],
                            "handoff_from": [],
                        },
                    ]
                )

            topology: SectionRoleTopology = {
                "section_id": section_id,
                "active_roles": active_roles,
                "part_graph": part_graph,
            }
            topologies.append(topology)

        return {
            "topologies": topologies,
            "extraction_notes": "Extracted roles and computed handoffs.",
        }
