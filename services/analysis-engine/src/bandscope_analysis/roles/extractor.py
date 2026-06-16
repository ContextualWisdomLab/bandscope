"""Role extractor implementation."""

from __future__ import annotations

import copy
import logging
from typing import Any

import numpy as np

from ..sections.utils import validate_section
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
        *,
        section_windows: list[tuple[float, float]] | None = None,
        section_chords: list[str] | None = None,
        lyric_cues: list[str] | None = None,
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

        vocal_range, vocal_chord, bass_range, bass_chord = self._extract_features(stems, sr)
        roles = self._build_roles(bass_chord, bass_range, vocal_chord, vocal_range)

        # Simple mock implementation for testing/demonstration purposes
        sample_rate = features.get("sr", 22050)
        previous_active_ids: set[str] = set()
        for i, section in enumerate(sections):
            section_id = validate_section(section, i, logger)
            section_roles = copy.deepcopy(roles)
            if section_chords and i < len(section_chords):
                self._apply_section_chord(section_roles, section_chords[i])
            if lyric_cues and i < len(lyric_cues) and lyric_cues[i]:
                section_roles["vocal"]["cue"] = {
                    "kind": CueAnchorKind.LYRIC,
                    "value": lyric_cues[i],
                }

            activity = None
            if section_windows and i < len(section_windows):
                activity = self._detect_section_activity(
                    stems=stems,
                    sample_rate=sample_rate if isinstance(sample_rate, int) else 22050,
                    start_time=section_windows[i][0],
                    end_time=section_windows[i][1],
                )

            topology = self._build_topology(
                section_id,
                i == 0,
                section_roles,
                section_activity=activity,
                previous_active_ids=previous_active_ids,
            )
            previous_active_ids = {
                node["role_id"] for node in topology["part_graph"] if node["is_active"]
            }
            topologies.append(topology)

        return {
            "topologies": topologies,
            "extraction_notes": "Extracted roles and computed handoffs.",
        }

    def _apply_section_chord(self, roles: dict[str, RehearsalRole], chord: str) -> None:
        """Inject section-level chord context into model-sourced role harmony."""
        if not chord or chord == "N":
            return
        for role in roles.values():
            if role["harmony"]["source"] == "model":
                role["harmony"]["chord"] = chord

    def _extract_features(
        self, stems: dict[str, Any], sr: int
    ) -> tuple[RangeSummary, str, RangeSummary, str]:
        """Extract vocal and bass features (range and chord) from stems."""
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

        return vocal_range, vocal_chord, bass_range, bass_chord

    def _build_roles(
        self,
        bass_chord: str,
        bass_range: RangeSummary,
        vocal_chord: str,
        vocal_range: RangeSummary,
    ) -> dict[str, RehearsalRole]:
        """Build the 5 mock rehearsal roles and compute their priorities."""
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

        roles_list = [bass_role, keys_left_role, keys_role, vocal_role, acoustic_guitar_role]
        for role in roles_list:
            role["rehearsalPriority"] = calculate_rehearsal_priority(role)

        return {
            "bass": bass_role,
            "keys_left": keys_left_role,
            "keys_right": keys_role,
            "vocal": vocal_role,
            "acoustic_guitar": acoustic_guitar_role,
        }

    def _build_topology(
        self,
        section_id: str,
        is_first: bool,
        roles: dict[str, RehearsalRole],
        *,
        section_activity: dict[str, bool] | None = None,
        previous_active_ids: set[str] | None = None,
    ) -> SectionRoleTopology:
        """Construct the topology including active roles and the part graph."""
        if section_activity is not None:
            return self._build_activity_topology(
                section_id,
                roles,
                section_activity,
                previous_active_ids,
            )

        active_roles = [roles["bass"], roles["acoustic_guitar"]]

        part_graph: list[PartGraphNode] = [
            {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []},
            {
                "role_id": "acoustic-guitar",
                "is_active": True,
                "handoff_to": [],
                "handoff_from": [],
            },
        ]

        if is_first:
            active_roles.extend([roles["keys_left"], roles["keys_right"], roles["vocal"]])
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

        return {
            "section_id": section_id,
            "active_roles": active_roles,
            "part_graph": part_graph,
        }

    def _build_activity_topology(
        self,
        section_id: str,
        roles: dict[str, RehearsalRole],
        section_activity: dict[str, bool],
        previous_active_ids: set[str] | None,
    ) -> SectionRoleTopology:
        role_order = (
            ("bass-guitar", "bass"),
            ("acoustic-guitar", "acoustic_guitar"),
            ("keys-left", "keys_left"),
            ("keys-right", "keys_right"),
            ("lead-vocal", "vocal"),
        )
        part_graph: list[PartGraphNode] = []
        active_roles: list[RehearsalRole] = []
        current_active_ids: set[str] = set()

        for role_id, role_key in role_order:
            is_active = bool(section_activity.get(role_id, False))
            if is_active:
                active_roles.append(roles[role_key])
                current_active_ids.add(role_id)
            part_graph.append(
                {"role_id": role_id, "is_active": is_active, "handoff_to": [], "handoff_from": []}
            )

        previous = previous_active_ids or set()
        entering = current_active_ids - previous
        exiting = previous - current_active_ids
        if entering and exiting:
            graph_by_role = {node["role_id"]: node for node in part_graph}
            for from_role in exiting:
                from_node = graph_by_role.get(from_role)
                if from_node is None:
                    continue
                for to_role in entering:
                    to_node = graph_by_role.get(to_role)
                    if to_node is None:
                        continue
                    from_node["handoff_to"].append(to_role)
                    to_node["handoff_from"].append(from_role)

        return {
            "section_id": section_id,
            "active_roles": active_roles,
            "part_graph": part_graph,
        }

    def _detect_section_activity(
        self,
        *,
        stems: dict[str, Any],
        sample_rate: int,
        start_time: float,
        end_time: float,
    ) -> dict[str, bool]:
        """Map stem-energy activity to rehearsal roles for one section window."""
        if sample_rate <= 0:
            sample_rate = 22050
        stem_to_roles = {
            "bass": ("bass-guitar",),
            "vocals": ("lead-vocal",),
            "other": ("acoustic-guitar", "keys-left", "keys-right"),
            "drums": (),
        }
        role_activity = {
            "bass-guitar": False,
            "lead-vocal": False,
            "acoustic-guitar": False,
            "keys-left": False,
            "keys-right": False,
        }
        for stem_name, roles_for_stem in stem_to_roles.items():
            stem = stems.get(stem_name)
            if not isinstance(stem, np.ndarray) or stem.size == 0:
                continue
            start_idx = max(0, int(round(start_time * sample_rate)))
            end_idx = max(start_idx + 1, int(round(end_time * sample_rate)))
            bounded_end = min(end_idx, stem.size)
            bounded_start = min(start_idx, max(0, bounded_end - 1))
            section_chunk = stem[bounded_start:bounded_end]
            if section_chunk.size == 0:
                continue
            section_rms = float(
                np.sqrt(np.mean(np.square(np.asarray(section_chunk, dtype=np.float64))))
            )
            global_rms = float(np.sqrt(np.mean(np.square(np.asarray(stem, dtype=np.float64)))))
            threshold = max(1e-4, global_rms * 0.35)
            is_active = section_rms >= threshold
            for role_id in roles_for_stem:
                role_activity[role_id] = is_active
        return role_activity
