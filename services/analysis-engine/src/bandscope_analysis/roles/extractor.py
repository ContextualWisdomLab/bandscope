"""Role extractor implementation."""

from __future__ import annotations

import logging
from typing import Any

from .model import (
    CueAnchorKind,
    PartGraphNode,
    RehearsalPriority,
    RehearsalRole,
    RoleExtractionResult,
    RoleType,
    SectionRoleTopology,
)

logger = logging.getLogger(__name__)


class RoleExtractor:
    """Extracts roles and builds the part graph for song sections."""

    def __init__(self) -> None:
        """Initialize the role extractor."""
        pass

    def extract(
        self,
        sections: list[Any],
        _audio_features: dict[str, Any] | None = None,
    ) -> RoleExtractionResult:
        """Extract roles and their topology per section.

        Args:
            sections: List of section dicts (must contain 'id').
            _audio_features: Optional audio features to inform extraction.

        Returns:
            RoleExtractionResult containing topologies and notes.
        """
        topologies: list[SectionRoleTopology] = []

        # Simple mock implementation for testing/demonstration purposes
        for i, section in enumerate(sections):
            if not isinstance(section, dict):
                logger.warning("Invalid section format at index %d; expected dict, got %s", i, type(section).__name__)
                section_id = f"section-{i}"
            else:
                section_id = section.get("id", f"section-{i}")

            # Create a mock bass role
            bass_role: RehearsalRole = {
                "id": "bass-guitar",
                "name": "Bass Guitar",
                "roleType": RoleType.INSTRUMENT,
                "harmony": {"chord": "C#m7", "functionLabel": "vi pedal anchor", "source": "model"},
                "cue": {
                    "kind": CueAnchorKind.TRANSITION,
                    "value": "Hold through the pickup before the downbeat.",
                },
                "range": {"lowestNote": "C#2", "highestNote": "E3"},
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Watch the slide into the turnaround.",
                },
                "rehearsalPriority": RehearsalPriority.HIGH,
                "simplification": "Stay on roots if the chorus entrance gets muddy.",
                "setupNote": "Keep the attack short so the verse breathes.",
                "manualOverrides": [],
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
                "rehearsalPriority": RehearsalPriority.HIGH,
                "simplification": "Drop top extension if the chorus turnaround feels busy.",
                "setupNote": "Keep the patch bright enough to stay over the guitars.",
                "manualOverrides": [],
            }

            vocal_role: RehearsalRole = {
                "id": "lead-vocal",
                "name": "Lead Vocal",
                "roleType": RoleType.VOCAL,
                "harmony": {
                    "chord": "C#m7",
                    "functionLabel": "vi melodic pull",
                    "source": "model",
                },
                "cue": {"kind": CueAnchorKind.LYRIC, "value": "city lights"},
                "range": {"lowestNote": "G#3", "highestNote": "C#5"},
                "confidence": {
                    "level": "high",
                    "source": "user",
                    "notes": "Singer confirmed the pickup phrasing in rehearsal notes.",
                },
                "rehearsalPriority": RehearsalPriority.MEDIUM,
                "simplification": "Keep sustained note centered; skip ad-lib on first pass.",
                "setupNote": "Watch the breath before the last line of the verse.",
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
            }

            active_roles = [bass_role]

            # Simple part graph for bass
            part_graph: list[PartGraphNode] = [
                {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []}
            ]

            if i == 0:
                active_roles.extend([keys_role, vocal_role])
                part_graph.extend(
                    [
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
                part_graph[0]["handoff_to"].append("lead-vocal")
                part_graph[2]["handoff_from"].append("bass-guitar")
            else:
                part_graph.extend(
                    [
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
