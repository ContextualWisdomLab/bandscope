"""Chord analysis logic for extracting harmonic content from sections."""

from __future__ import annotations

import logging
from typing import Any, Literal

import numpy as np

from ..sections.utils import validate_section
from .chord_recognizer import ChordRecognizer, TrackedChord
from .model import ChordAnalysisResult, ChordLabel, SectionChordSummary

logger = logging.getLogger(__name__)

# Default key center when no harmonic context is available
_DEFAULT_KEY_CENTER = "C"


class ChordAnalyzer:
    """Analyzes chord progressions from section and role data, with optional audio input.

    When audio stems are provided, uses the ChordRecognizer (chromagram + Viterbi)
    to derive actual chord labels from the signal, fully replacing hardcoded defaults.

    Security Notes:
    - Processes untrusted input: chord symbols, function labels, and source
      fields from role harmony data.
    - Input validation: all values are coerced to str via str(); no eval or exec.
    - Safe failure: missing or malformed harmony data is skipped silently.
    - Trust boundary: chord and functionLabel are treated as opaque strings;
      they are stored but not interpreted or executed.
    - Allowlist: source field is passed through as-is; the upstream validator
      constrains it to 'model' | 'user'.
    """

    def __init__(self) -> None:
        """Initialize the chord analyzer."""
        self._recognizer = ChordRecognizer()

    def analyze(
        self,
        sections: list[dict[str, Any]],
        roles_by_section: dict[str, list[dict[str, Any]]] | None = None,
        audio_stems: dict[str, np.ndarray] | None = None,
        sample_rate: int = 22050,
    ) -> ChordAnalysisResult:
        """Analyze chord content for the given sections.

        When audio_stems are provided, uses DSP-based chord recognition on the
        harmonic stems (keys, guitar, 'other') to derive real chords. Falls back
        to role-derived chord data when audio is not available.

        Args:
            sections: List of section dicts (must contain 'id').
            roles_by_section: Optional mapping of section_id to roles with harmony data.
            audio_stems: Optional dict of stem name to audio array (e.g. from separation).
            sample_rate: Sample rate of the audio stems.

        Returns:
            ChordAnalysisResult containing per-section chord summaries.
        """
        # If we have audio stems, run DSP-based recognition first
        recognized_chords: list[TrackedChord] = []
        if audio_stems:
            recognized_chords = self._recognize_from_stems(audio_stems, sample_rate)

        summaries: list[SectionChordSummary] = []

        for i, section in enumerate(sections):
            section_id = validate_section(section, i, logger)

            chords: list[ChordLabel] = []
            key_center = _DEFAULT_KEY_CENTER

            # First, try user-provided role harmony data (user overrides always win)
            section_roles = (roles_by_section or {}).get(section_id, [])
            user_chords = self._extract_user_chords(section_roles)

            if user_chords:
                chords = user_chords
                section_recognized = []
            elif recognized_chords:
                # Use DSP-recognized chords for this section's time range
                section_time = section.get("timeRange")
                section_recognized = self._filter_recognized_for_section(
                    recognized_chords, section_time
                )
                chords = self._chords_for_section(recognized_chords, section_time)
            else:
                section_recognized = []
                # Fall back to model-sourced role harmony data
                chords = self._extract_role_chords(section_roles)

            # Infer key center from the first chord if available
            if chords:
                key_center = _infer_key_center(chords[0]["chord"])

            confidence_level, confidence_source = self._compute_section_confidence(
                chords, section_recognized, user_chords
            )

            summaries.append(
                {
                    "section_id": section_id,
                    "chords": chords,
                    "key_center": key_center,
                    "confidence_level": confidence_level,
                    "confidence_source": confidence_source,
                }
            )

        return {
            "sections": summaries,
            "analysis_notes": f"Analyzed chords for {len(summaries)} sections.",
        }

    def _recognize_from_stems(
        self, stems: dict[str, np.ndarray], sr: int
    ) -> list[TrackedChord]:
        """Run chord recognition on harmonic stems (other, bass as fallback).

        Args:
            stems: Dict of stem name to audio array.
            sr: Sample rate.

        Returns:
            List of recognized chord segments.
        """
        # Prefer 'other' stem (contains keys, guitar, etc.) for chord recognition
        harmonic_stem = stems.get("other")
        if harmonic_stem is None or len(harmonic_stem) == 0:
            harmonic_stem = stems.get("bass")
        if harmonic_stem is None or len(harmonic_stem) == 0:
            return []

        try:
            return self._recognizer.recognize(harmonic_stem, sr=sr)
        except Exception as e:
            logger.warning("Chord recognition from stems failed: %s", e)
            return []

    def _extract_user_chords(self, section_roles: list[dict[str, Any]]) -> list[ChordLabel]:
        """Extract only user-sourced chords from role harmony data."""
        chords: list[ChordLabel] = []
        seen: set[str] = set()
        for role in section_roles:
            harmony = role.get("harmony")
            if isinstance(harmony, dict) and "chord" in harmony:
                if harmony.get("source") == "user":
                    chord_name = str(harmony["chord"])
                    if chord_name not in seen:
                        seen.add(chord_name)
                        chords.append(
                            {
                                "chord": chord_name,
                                "functionLabel": str(harmony.get("functionLabel", "")),
                                "source": "user",
                            }
                        )
        return chords

    def _extract_role_chords(self, section_roles: list[dict[str, Any]]) -> list[ChordLabel]:
        """Extract model-sourced chords from role harmony data (legacy path)."""
        chords: list[ChordLabel] = []
        seen: set[str] = set()
        for role in section_roles:
            harmony = role.get("harmony")
            if isinstance(harmony, dict) and "chord" in harmony:
                chord_name = str(harmony["chord"])
                if chord_name not in seen:
                    seen.add(chord_name)
                    chords.append(
                        {
                            "chord": chord_name,
                            "functionLabel": str(harmony.get("functionLabel", "")),
                            "source": harmony.get("source", "model"),
                        }
                    )
        return chords

    def _filter_recognized_for_section(
        self,
        recognized: list[TrackedChord],
        time_range: dict[str, Any] | None,
    ) -> list[TrackedChord]:
        """Filter recognized chords to those overlapping a section's time range."""
        if not time_range or not isinstance(time_range, dict):
            return recognized

        start = time_range.get("start", 0)
        end = time_range.get("end", float("inf"))
        return [
            c for c in recognized if c["end_time"] >= start and c["start_time"] <= end
        ]

    def _chords_for_section(
        self,
        recognized: list[TrackedChord],
        time_range: dict[str, Any] | None,
    ) -> list[ChordLabel]:
        """Map recognized chord segments into ChordLabel format for a section.

        Filters by section time range if available, deduplicates, and maps
        confidence from the recognizer into functionLabel hints.
        """
        valid_chords = [c for c in recognized if c["chord"] != "N"]
        if not valid_chords:
            return []

        # If we have section time boundaries, filter
        if time_range and isinstance(time_range, dict):
            start = time_range.get("start", 0)
            end = time_range.get("end", float("inf"))
            valid_chords = [
                c for c in valid_chords if c["end_time"] >= start and c["start_time"] <= end
            ]

        # Deduplicate while preserving order
        seen: set[str] = set()
        chords: list[ChordLabel] = []
        for chord_seg in valid_chords:
            chord_name = chord_seg["chord"]
            if chord_name not in seen:
                seen.add(chord_name)
                chords.append(
                    {
                        "chord": chord_name,
                        "functionLabel": "",
                        "source": "model",
                    }
                )

        return chords

    def _compute_section_confidence(
        self,
        chords: list[ChordLabel],
        recognized_chords: list[TrackedChord],
        user_chords: list[ChordLabel],
    ) -> tuple[Literal["low", "medium", "high"], Literal["model", "user"]]:
        """Compute section-level confidence based on chord source and recognition quality."""
        if not chords:
            return "low", "model"

        # User-sourced chords get high confidence
        if user_chords:
            return "high", "user"

        # DSP-recognized chords: derive confidence from recognizer's entropy scoring
        if recognized_chords:
            valid_chords = [c for c in recognized_chords if c["chord"] != "N"]
            if valid_chords:
                high_count = sum(1 for c in valid_chords if c.get("confidence") == "high")
                ratio = high_count / len(valid_chords)
                if ratio > 0.5:
                    return "high", "model"
                if ratio > 0.2:
                    return "medium", "model"
                return "low", "model"

        # Legacy role-sourced chords default to medium confidence
        return "medium", "model"


def _infer_key_center(chord: str) -> str:
    """Infer a key center from a chord symbol.

    Extracts the root note from a chord symbol by taking the first
    character (and optional sharp/flat modifier).

    Args:
        chord: A chord symbol like 'C#m7', 'Bb', 'G'.

    Returns:
        The root note as a key center string.
    """
    if not chord:
        return _DEFAULT_KEY_CENTER
    root = chord[0]
    if len(chord) > 1 and chord[1] in ("#", "b"):
        root += chord[1]
    return root
