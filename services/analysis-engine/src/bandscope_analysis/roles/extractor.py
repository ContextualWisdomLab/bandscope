"""Role extractor implementation."""

from __future__ import annotations

import logging
from math import isfinite
from typing import Any

from ..sections.utils import validate_section
from .activity import (
    compute_handoffs,
    detect_stem_activity,
    detect_stem_energy,
    map_stems_to_role_energy,
    map_stems_to_roles,
)
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

_OTHER_STEM_ROLE_IDS = frozenset({"keys-left", "keys-right", "acoustic-guitar"})
_NAMED_SWELL_ROLE_IDS = frozenset({"lead-vocal", "bass-guitar"})
_SWELL_PLAN_SOLO = "Swell this part; grow into the next downbeat."
_SWELL_PLAN_PREFIX = "Swell this part with "
_SWELL_PLAN_SUFFIX = "; grow into the next downbeat."
_SWELL_RATIO = 1.8
_SWELL_PREVIOUS_FLOOR = 1e-4


class RoleExtractor:
    """Extracts roles and builds the part graph for song sections."""

    def extract(
        self,
        sections: list[Any],
        audio_features: dict[str, Any] | None = None,
    ) -> RoleExtractionResult:
        """Extract roles and their topology per section.

        When audio_features includes stems and boundaries, real stem activity
        detection is used to determine which roles are active in each section.
        Falls back to heuristic-based topology when real stems are unavailable.

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
        boundaries: list[tuple[float, float]] = features.get("boundaries", [])

        vocal_range, vocal_chord, bass_range, bass_chord = self._extract_features(stems, sr)
        roles = self._build_roles(bass_chord, bass_range, vocal_chord, vocal_range)

        # Keep raw stem source sets beside rendered role activity so swell
        # continuity can see non-rendered sources such as drums.
        activity_evidence: list[tuple[dict[str, bool], set[str]]] | None = None
        energy_maps: list[dict[str, float]] | None = None
        if stems and boundaries and len(boundaries) == len(sections):
            try:
                stem_activity = detect_stem_activity(stems, boundaries, sr)
                activity_evidence = [
                    (
                        map_stems_to_roles(segment_activity),
                        {stem_id for stem_id, is_active in segment_activity.items() if is_active},
                    )
                    for segment_activity in stem_activity
                ]
            except Exception as e:
                logger.warning("Stem activity detection failed, using fallback: %s", e)
                activity_evidence = None
            try:
                stem_energy = detect_stem_energy(stems, boundaries, sr)
                energy_maps = [map_stems_to_role_energy(se) for se in stem_energy]
            except Exception as e:
                logger.warning("Stem energy detection failed, leaving swell unnamed: %s", e)
                energy_maps = None

        for i, section in enumerate(sections):
            section_id = validate_section(section, i, logger)

            if activity_evidence is not None:
                # Real activity-based topology
                current_activity, current_source_ids = activity_evidence[i]
                next_activity = (
                    activity_evidence[i + 1][0] if i + 1 < len(activity_evidence) else None
                )
                previous_activity = activity_evidence[i - 1][0] if i > 0 else None
                stem_source_continuity = (
                    current_source_ids == activity_evidence[i - 1][1] if i > 0 else None
                )
                current_energy = energy_maps[i] if energy_maps is not None else None
                previous_energy = energy_maps[i - 1] if energy_maps is not None and i > 0 else None
                topology = self._build_activity_topology(
                    section_id,
                    roles,
                    current_activity,
                    next_activity,
                    previous_activity,
                    current_energy,
                    previous_energy,
                    stem_source_continuity,
                )
            else:
                # Fallback to heuristic-based topology
                topology = self._build_topology(section_id, i == 0, roles)

            topologies.append(topology)

        extraction_method = (
            "Extracted roles from real stem activity detection."
            if activity_evidence is not None
            else "Extracted roles and computed handoffs."
        )

        return {
            "topologies": topologies,
            "extraction_notes": extraction_method,
        }

    def _extract_features(
        self, stems: dict[str, Any], sr: int
    ) -> tuple[RangeSummary, str, RangeSummary, str]:
        """Extract vocal and bass features (range and chord) from stems.

        When real audio stems are available, uses PitchTracker (pYIN) and
        ChordRecognizer (chromagram + Viterbi) to derive actual ranges and chords
        from the signal. Returns signal-derived values instead of hardcoded defaults.

        Args:
            stems: Dict mapping stem names to numpy audio arrays.
            sr: Sample rate of the audio.

        Returns:
            Tuple of (vocal_range, vocal_chord, bass_range, bass_chord).
        """
        if not stems:
            return (
                {"lowestNote": "", "highestNote": ""},
                "",
                {"lowestNote": "", "highestNote": ""},
                "",
            )

        vocal_range: RangeSummary = {"lowestNote": "", "highestNote": ""}
        vocal_chord = ""
        bass_range: RangeSummary = {"lowestNote": "", "highestNote": ""}
        bass_chord = ""

        try:
            from ..chords.chord_recognizer import ChordRecognizer
            from ..ranges.pitch_tracker import PitchTracker

            pitch_tracker = PitchTracker()
            chord_recognizer = ChordRecognizer()

            # Extract vocal range from vocal stem
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

            # Extract bass range and chord from bass stem
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
                    valid_chords = [c["chord"] for c in c_res if c["chord"] != "N"]
                    if valid_chords:
                        # Use the most common chord across all segments
                        bass_chord = _most_common_chord(valid_chords)

            # Extract harmonic chord from 'other' stem (keys, guitar, etc.)
            if "other" in stems:
                c_res = chord_recognizer.recognize(stems["other"], sr=sr)
                if c_res and len(c_res) > 0:
                    valid_chords = [c["chord"] for c in c_res if c["chord"] != "N"]
                    if valid_chords:
                        vocal_chord = _most_common_chord(valid_chords)
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
        """Build the 5 rehearsal roles and compute their priorities."""
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

    @staticmethod
    def _source_id(role_id: str) -> str:
        """Collapse accompaniment stems onto one rehearsal source."""
        return "other" if role_id in _OTHER_STEM_ROLE_IDS else role_id

    @staticmethod
    def _active_role_ids(role_activity: dict[str, bool]) -> set[str]:
        """Return role ids whose activity flag is explicitly true."""
        return {role_id for role_id, is_active in role_activity.items() if is_active}

    @classmethod
    def _source_ids(cls, role_ids: set[str]) -> set[str]:
        """Return distinct source-separation stems among the given roles."""
        return {cls._source_id(role_id) for role_id in role_ids}

    def _named_swell_ids(
        self,
        role_activity: dict[str, bool],
        previous_role_activity: dict[str, bool],
        role_energy: dict[str, float] | None,
        previous_role_energy: dict[str, float] | None,
        stem_source_continuity: bool | None = None,
    ) -> set[str]:
        """Return named staying roles whose RMS rose by the swell ratio."""
        if role_energy is None or previous_role_energy is None:
            return set()
        if stem_source_continuity is False:
            return set()
        previous_active = self._active_role_ids(previous_role_activity)
        current_active = self._active_role_ids(role_activity)
        if self._source_ids(previous_active) != self._source_ids(current_active):
            return set()
        swelled: set[str] = set()
        for role_id in _NAMED_SWELL_ROLE_IDS & current_active & previous_active:
            previous_rms = float(previous_role_energy.get(role_id, 0.0) or 0.0)
            current_rms = float(role_energy.get(role_id, 0.0) or 0.0)
            if not isfinite(previous_rms) or not isfinite(current_rms):
                continue
            if previous_rms < _SWELL_PREVIOUS_FLOOR:
                continue
            if current_rms < previous_rms * _SWELL_RATIO:
                continue
            swelled.add(role_id)
        return swelled

    def _activity_swell_plan(
        self,
        role_id: str,
        roles: dict[str, RehearsalRole],
        role_activity: dict[str, bool],
        previous_role_activity: dict[str, bool] | None,
        role_energy: dict[str, float] | None,
        previous_role_energy: dict[str, float] | None,
        stem_source_continuity: bool | None = None,
    ) -> str | None:
        """Return bounded swell guidance only for a corroborated intensity rise.

        A swell plan is emitted only when real stem activity shows this named
        part staying while its RMS grows by at least 1.8× after an already
        audible previous section, and the distinct source set does not change.
        A density fill (drop), a thinning hold (breakdown), a leaving part
        (dropout), a first-section, heuristic topology, or an accompaniment
        ``other`` landing stay unnamed.
        """
        if previous_role_activity is None:
            return None
        if role_id in _OTHER_STEM_ROLE_IDS:
            return None
        swelled = self._named_swell_ids(
            role_activity,
            previous_role_activity,
            role_energy,
            previous_role_energy,
            stem_source_continuity,
        )
        if role_id not in swelled:
            return None
        partners = sorted(swelled - {role_id})
        if not partners:
            return _SWELL_PLAN_SOLO
        partner_id = partners[0]
        other_name = next(
            (role["name"] for role in roles.values() if role["id"] == partner_id),
            None,
        )
        if other_name is None:
            return None
        return f"{_SWELL_PLAN_PREFIX}{other_name}{_SWELL_PLAN_SUFFIX}"

    def _build_activity_topology(
        self,
        section_id: str,
        roles: dict[str, RehearsalRole],
        role_activity: dict[str, bool],
        next_role_activity: dict[str, bool] | None,
        previous_role_activity: dict[str, bool] | None = None,
        role_energy: dict[str, float] | None = None,
        previous_role_energy: dict[str, float] | None = None,
        stem_source_continuity: bool | None = None,
    ) -> SectionRoleTopology:
        """Build topology from real stem activity detection."""
        handoffs = compute_handoffs(role_activity, next_role_activity)

        # Map role_id to role key in the roles dict
        role_id_to_key = {
            "bass-guitar": "bass",
            "keys-left": "keys_left",
            "keys-right": "keys_right",
            "lead-vocal": "vocal",
            "acoustic-guitar": "acoustic_guitar",
        }

        active_roles: list[RehearsalRole] = []
        part_graph: list[PartGraphNode] = []

        for role_id, role_key in role_id_to_key.items():
            is_active = role_activity.get(role_id, False)
            handoff_to, handoff_from = handoffs.get(role_id, ([], []))

            if is_active:
                role = roles[role_key]
                swell_plan = self._activity_swell_plan(
                    role_id,
                    roles,
                    role_activity,
                    previous_role_activity,
                    role_energy,
                    previous_role_energy,
                    stem_source_continuity,
                )
                if swell_plan is not None:
                    role = role.copy()
                    role["swellPlan"] = swell_plan
                    role["swellPlanSource"] = "model"
                active_roles.append(role)

            part_graph.append(
                {
                    "role_id": role_id,
                    "is_active": is_active,
                    "handoff_to": handoff_to,
                    "handoff_from": handoff_from,
                }
            )

        return {
            "section_id": section_id,
            "active_roles": active_roles,
            "part_graph": part_graph,
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


def _most_common_chord(chords: list[str]) -> str:
    """Return the most frequently occurring chord from a list.

    Args:
        chords: Non-empty list of chord label strings.

    Returns:
        The chord that appears most frequently. Ties broken by first occurrence.
    """
    counts: dict[str, int] = {}
    for chord in chords:
        counts[chord] = counts.get(chord, 0) + 1
    return max(counts, key=lambda c: counts[c])
