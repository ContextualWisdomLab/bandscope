"""Role extractor implementation."""

from __future__ import annotations

import logging
from math import log2
from typing import Any, Literal, Mapping, Sequence

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

ConfidenceLevel = Literal["low", "medium", "high"]


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

        extracted = self._extract_features(stems, sr)
        roles = self._build_roles(extracted)

        # Simple mock implementation for testing/demonstration purposes
        for i, section in enumerate(sections):
            section_id = validate_section(section, i, logger)

            topology = self._build_topology(section_id, i == 0, roles)
            topologies.append(topology)

        return {
            "topologies": topologies,
            "extraction_notes": "Extracted roles and computed handoffs.",
        }

    def _extract_features(self, stems: dict[str, Any], sr: int) -> dict[str, Any]:
        """Extract vocal and bass features (range and chord) from stems."""
        vocal_range: RangeSummary = {"lowestNote": "C4", "highestNote": "C4"}
        vocal_chord = "N"
        bass_range: RangeSummary = {"lowestNote": "C2", "highestNote": "C2"}
        bass_chord = "N"
        vocal_pitch_confidence: ConfidenceLevel = "low"
        bass_pitch_confidence: ConfidenceLevel = "low"
        harmony_chord = "N"
        harmony_confidence: ConfidenceLevel = "low"
        harmony_notes = "No harmonic stem chord frames were detected."
        harmony_segments: list[dict[str, object]] = []

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
                        vocal_pitch_confidence = self._normalize_confidence(p_res.get("confidence"))
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
                        bass_pitch_confidence = self._normalize_confidence(p_res.get("confidence"))
                        if b_lowest and b_highest:
                            bass_range = {
                                "lowestNote": b_lowest,
                                "highestNote": b_highest,
                            }
                    c_res = chord_recognizer.recognize(stems["bass"], sr=sr)
                    if c_res and len(c_res) > 0:
                        bass_chord = self._first_recognized_chord(c_res)

                if "other" in stems:
                    harmony_segments = [
                        dict(segment)
                        for segment in chord_recognizer.recognize(stems["other"], sr=sr)
                    ]
                    if harmony_segments and len(harmony_segments) > 0:
                        harmony_chord = self._first_recognized_chord(harmony_segments)
                        harmony_confidence, harmony_notes = self._estimate_chord_confidence(
                            harmony_segments
                        )
                if harmony_chord != "N":
                    vocal_chord = harmony_chord
            except Exception as e:
                logger.warning("Failed to extract features from stems: %s", e)

        bass_chord_confidence: ConfidenceLevel = "high" if bass_chord != "N" else "low"
        vocal_confidence, vocal_notes = self._merge_confidence(
            vocal_pitch_confidence,
            "high" if vocal_chord != "N" else "low",
            "vocal stem voicing and harmonic stem agreement",
        )
        bass_confidence, bass_notes = self._merge_confidence(
            bass_pitch_confidence,
            bass_chord_confidence,
            "bass pitch stability and harmonic consistency",
        )
        if harmony_chord == "N" and harmony_segments:
            _, harmony_notes = self._estimate_chord_confidence(harmony_segments)

        return {
            "vocal_range": vocal_range,
            "vocal_chord": vocal_chord,
            "vocal_confidence": vocal_confidence,
            "vocal_confidence_notes": vocal_notes,
            "bass_range": bass_range,
            "bass_chord": bass_chord,
            "bass_confidence": bass_confidence,
            "bass_confidence_notes": bass_notes,
            "harmony_chord": harmony_chord if harmony_chord != "N" else vocal_chord,
            "harmony_confidence": harmony_confidence,
            "harmony_confidence_notes": harmony_notes,
        }

    def _first_recognized_chord(self, chords: Sequence[Any]) -> str:
        """Return the first recognized chord label from a sequence of segments."""
        for chord_segment in chords:
            if not isinstance(chord_segment, Mapping):
                continue
            chord = str(chord_segment.get("chord", "N")).strip()
            if chord and chord != "N":
                return chord
        return "N"

    def _estimate_chord_confidence(self, chords: Sequence[Any]) -> tuple[ConfidenceLevel, str]:
        """Estimate confidence using label entropy and non-noise coverage."""
        if not chords:
            return "low", "No harmonic stem chord frames were detected."

        durations_by_chord: dict[str, float] = {}
        total_duration = 0.0
        voiced_duration = 0.0

        for segment in chords:
            if not isinstance(segment, Mapping):
                continue
            chord = str(segment.get("chord", "N"))
            start = self._as_float(segment.get("start_time", segment.get("start", 0.0)))
            end = self._as_float(segment.get("end_time", segment.get("end", start + 1.0)))
            duration = max(0.0, end - start)
            if duration == 0.0:
                duration = 1.0
            total_duration += duration
            if chord != "N":
                durations_by_chord[chord] = durations_by_chord.get(chord, 0.0) + duration
                voiced_duration += duration

        if voiced_duration <= 0.0 or total_duration <= 0.0:
            return "low", "Harmonic stem was mostly noise or unvoiced content."

        coverage = voiced_duration / total_duration
        probabilities = [d / voiced_duration for d in durations_by_chord.values() if d > 0]
        entropy = -sum(p * log2(p) for p in probabilities if p > 0)
        normalized_entropy = entropy / log2(len(probabilities)) if len(probabilities) > 1 else 0.0
        dominance = max(probabilities) if probabilities else 0.0

        if coverage >= 0.75 and normalized_entropy <= 0.35 and dominance >= 0.7:
            level: ConfidenceLevel = "high"
        elif coverage >= 0.45 and dominance >= 0.45:
            level = "medium"
        else:
            level = "low"

        return (
            level,
            (
                f"Chord confidence from harmonic stem: coverage={coverage:.2f}, "
                f"entropy={normalized_entropy:.2f}, dominance={dominance:.2f}."
            ),
        )

    def _merge_confidence(
        self,
        pitch_confidence: ConfidenceLevel,
        chord_confidence: ConfidenceLevel,
        context: str,
    ) -> tuple[ConfidenceLevel, str]:
        """Merge independent pitch/chord heuristics into a role confidence marker."""
        confidence_order = {"low": 0, "medium": 1, "high": 2}
        merged_value = min(confidence_order[pitch_confidence], confidence_order[chord_confidence])
        merged: ConfidenceLevel
        if merged_value == 2:
            merged = "high"
        elif merged_value == 1:
            merged = "medium"
        else:
            merged = "low"
        return (
            merged,
            (
                f"Confidence derived from {context}: "
                f"pitch={pitch_confidence}, harmony={chord_confidence}."
            ),
        )

    def _normalize_confidence(self, value: Any) -> ConfidenceLevel:
        """Normalize external confidence values into the role confidence scale."""
        if value == "high":
            return "high"
        if value == "medium":
            return "medium"
        return "low"

    def _as_float(self, value: object) -> float:
        """Coerce dynamic values to float with a safe 0.0 fallback."""
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return 0.0
        return 0.0

    def _build_roles(self, extracted: dict[str, Any]) -> dict[str, RehearsalRole]:
        """Build the 5 mock rehearsal roles and compute their priorities."""
        bass_chord = extracted["bass_chord"]
        bass_range = extracted["bass_range"]
        vocal_chord = extracted["vocal_chord"]
        vocal_range = extracted["vocal_range"]
        harmony_chord = extracted["harmony_chord"]

        bass_role: RehearsalRole = {
            "id": "bass-guitar",
            "name": "Bass Guitar",
            "roleType": RoleType.INSTRUMENT,
            "harmony": {
                "chord": bass_chord,
                "functionLabel": "Low-end anchor",
                "source": "model",
            },
            "cue": {
                "kind": CueAnchorKind.TRANSITION,
                "value": "Hold through the pickup before the downbeat.",
            },
            "range": bass_range,
            "confidence": {
                "level": extracted["bass_confidence"],
                "source": "model",
                "notes": extracted["bass_confidence_notes"],
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
                "chord": harmony_chord,
                "functionLabel": "Harmonic color",
                "source": "model",
            },
            "cue": {
                "kind": CueAnchorKind.COUNT,
                "value": "Enter on beat 2 after the pickup.",
            },
            "range": {"lowestNote": "B3", "highestNote": "G#5"},
            "confidence": {
                "level": extracted["harmony_confidence"],
                "source": "model",
                "notes": extracted["harmony_confidence_notes"],
            },
            "rehearsalPriority": RehearsalPriority.HIGH,  # to be replaced
            "simplification": "Drop top extension if the chorus turnaround feels busy.",
            "setupNote": get_setup_note("Keyboard", [harmony_chord])
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
                "functionLabel": "Melodic center",
                "source": "model",
            },
            "cue": {"kind": CueAnchorKind.LYRIC, "value": "city lights"},
            "range": vocal_range,
            "confidence": {
                "level": extracted["vocal_confidence"],
                "source": "model",
                "notes": extracted["vocal_confidence_notes"],
            },
            "rehearsalPriority": RehearsalPriority.MEDIUM,  # to be replaced
            "simplification": "Keep sustained note centered; skip ad-lib on first pass.",
            "setupNote": get_setup_note("Lead Vocal", [vocal_chord])
            or "Watch the breath before the last line of the verse.",
            "manualOverrides": [
                {
                    "field": "harmony",
                    "value": {
                        "chord": vocal_chord,
                        "functionLabel": "User-reviewed harmony adjustment",
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
    ) -> SectionRoleTopology:
        """Construct the topology including active roles and the part graph."""
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
