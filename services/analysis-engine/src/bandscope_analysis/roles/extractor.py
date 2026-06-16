"""Role extractor implementation."""

from __future__ import annotations

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

# RMS energy threshold below which a stem is considered silent/inactive in a window.
_RMS_ACTIVITY_THRESHOLD = 0.01

# Maps stem names from source-separation output to the role IDs they drive.
# Demucs produces four stems: vocals, bass, drums, other.  "other" captures
# everything that is not vocals, bass, or percussion — guitars, keys, synths —
# so it maps to all remaining melodic/harmonic roles.  Drums are intentionally
# left unmapped: they are nearly always active and do not help disambiguate
# structural sections.
_STEM_TO_ROLE_IDS: dict[str, list[str]] = {
    "vocals": ["lead-vocal"],
    "bass": ["bass-guitar"],
    "other": ["keys-left", "keys-right", "acoustic-guitar"],
}


class RoleExtractor:
    """Extracts roles and builds the part graph for song sections."""

    def __init__(self) -> None:
        """Initialize the role extractor."""
        pass

    def extract(
        self,
        sections: list[Any],
        audio_features: dict[str, Any] | None = None,
        segment_boundaries: list[dict[str, Any]] | None = None,
    ) -> RoleExtractionResult:
        """Extract roles and their topology per section.

        Args:
            sections: List of section dicts (must contain 'id').
            audio_features: Optional audio features to inform extraction.
            segment_boundaries: Optional list of SegmentBoundary dicts (with
                ``start_sec`` and ``end_sec``) aligned to ``sections``.  When
                provided together with stems in ``audio_features``, each section
                gets its own stem-activity detection pass so the part graph
                reflects real instrumentation rather than a fixed pattern.

        Returns:
            RoleExtractionResult containing topologies and notes.
        """
        topologies: list[SectionRoleTopology] = []

        features = audio_features or {}
        stems = features.get("stems", {})
        sr = int(features.get("sr", 22050))

        vocal_range, vocal_chord, bass_range, bass_chord = self._extract_features(stems, sr)
        roles = self._build_roles(bass_chord, bass_range, vocal_chord, vocal_range)

        # Compute per-section active-stem sets when boundaries + real stems are available.
        active_sets: list[set[str] | None] = []
        for i, _ in enumerate(sections):
            boundary = (
                segment_boundaries[i]
                if segment_boundaries and i < len(segment_boundaries)
                else None
            )
            if boundary is not None and stems:
                active = self._detect_active_stems(
                    stems, sr, float(boundary["start_sec"]), float(boundary["end_sec"])
                )
                active_sets.append(active)
            else:
                active_sets.append(None)

        for i, section in enumerate(sections):
            section_id = validate_section(section, i, logger)
            active_stem_ids = active_sets[i]
            prev_active_stem_ids = active_sets[i - 1] if i > 0 else None

            topology = self._build_topology(
                section_id, i == 0, roles, active_stem_ids, prev_active_stem_ids
            )
            topologies.append(topology)

        return {
            "topologies": topologies,
            "extraction_notes": "Extracted roles and computed handoffs.",
        }

    def _detect_active_stems(
        self,
        stems: dict[str, Any],
        sr: int,
        start_sec: float,
        end_sec: float,
    ) -> set[str]:
        """Return the set of stem names with significant energy in the time window.

        A stem is considered active when its RMS amplitude in the requested
        window exceeds ``_RMS_ACTIVITY_THRESHOLD``.
        """
        start_sample = int(start_sec * sr)
        end_sample = int(end_sec * sr)
        active: set[str] = set()

        for stem_name, audio in stems.items():
            if not isinstance(audio, np.ndarray) or audio.size == 0:
                continue
            window = audio[start_sample:end_sample]
            if window.size == 0:
                continue
            rms = float(np.sqrt(np.mean(window.astype(np.float64) ** 2)))
            if rms > _RMS_ACTIVITY_THRESHOLD:
                active.add(stem_name)

        return active

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
        active_stem_ids: set[str] | None = None,
        prev_active_stem_ids: set[str] | None = None,
    ) -> SectionRoleTopology:
        """Construct the topology including active roles and the part graph.

        When ``active_stem_ids`` is provided (real audio path), role activity is
        driven by actual stem energy detected in the section window.  Otherwise
        the legacy position-based fallback is used (demo / no-audio path).

        Args:
            section_id: Stable identifier for the section.
            is_first: True when this is the first section in the song.
            roles: Pre-built role dict keyed by short name.
            active_stem_ids: Set of stem names with significant energy in this
                section.  ``None`` → use position-based fallback.
            prev_active_stem_ids: Active stems in the immediately preceding
                section, used to compute handoff edges.  ``None`` → no handoffs.
        """
        if active_stem_ids is not None:
            return self._build_topology_from_stems(
                section_id, roles, active_stem_ids, prev_active_stem_ids
            )
        return self._build_topology_position_based(section_id, is_first, roles)

    def _build_topology_from_stems(
        self,
        section_id: str,
        roles: dict[str, RehearsalRole],
        active_stem_ids: set[str],
        prev_active_stem_ids: set[str] | None,
    ) -> SectionRoleTopology:
        """Build topology driven by real stem-activity detection."""
        # Map stem names → role keys for the fixed role dict
        _KEY_BY_ROLE_ID = {
            "lead-vocal": "vocal",
            "bass-guitar": "bass",
            "acoustic-guitar": "acoustic_guitar",
            "keys-left": "keys_left",
            "keys-right": "keys_right",
        }

        # Determine which role IDs are active based on stem activity
        active_role_ids: set[str] = set()
        for stem_name in active_stem_ids:
            for role_id in _STEM_TO_ROLE_IDS.get(stem_name, []):
                active_role_ids.add(role_id)

        # Fallback: ensure at least bass and acoustic-guitar are present
        if not active_role_ids:
            active_role_ids = {"bass-guitar", "acoustic-guitar"}

        # Determine which role IDs were active in the previous section
        prev_active_role_ids: set[str] = set()
        if prev_active_stem_ids is not None:
            for stem_name in prev_active_stem_ids:
                for role_id in _STEM_TO_ROLE_IDS.get(stem_name, []):
                    prev_active_role_ids.add(role_id)

        # Roles that newly enter (prev inactive → now active)
        entering = active_role_ids - prev_active_role_ids
        # Roles that drop out (prev active → now inactive)
        exiting = prev_active_role_ids - active_role_ids

        # Build ordered role lists and part graph
        role_order = ["bass-guitar", "acoustic-guitar", "keys-left", "keys-right", "lead-vocal"]
        active_roles: list[RehearsalRole] = []
        part_graph: list[PartGraphNode] = []

        for role_id in role_order:
            role_key = _KEY_BY_ROLE_ID[role_id]
            role = roles[role_key]
            is_active = role_id in active_role_ids

            # Compute handoff edges for this role
            handoff_to: list[str] = []
            handoff_from: list[str] = []
            if role_id in exiting:
                handoff_to = sorted(entering)
            if role_id in entering:
                handoff_from = sorted(exiting)

            part_graph.append(
                {
                    "role_id": role_id,
                    "is_active": is_active,
                    "handoff_to": handoff_to,
                    "handoff_from": handoff_from,
                }
            )
            if is_active:
                active_roles.append(role)

        return {
            "section_id": section_id,
            "active_roles": active_roles,
            "part_graph": part_graph,
        }

    def _build_topology_position_based(
        self,
        section_id: str,
        is_first: bool,
        roles: dict[str, RehearsalRole],
    ) -> SectionRoleTopology:
        """Legacy position-based topology used for demo mode (no real audio)."""
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
