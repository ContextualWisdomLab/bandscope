"""Chord analysis logic for extracting harmonic content from sections."""

from __future__ import annotations

import logging
from typing import Any, Literal

from .model import ChordAnalysisResult, ChordLabel, SectionChordSummary

logger = logging.getLogger(__name__)

# Default key center when no harmonic context is available
_DEFAULT_KEY_CENTER = "C"


class ChordAnalyzer:
    """Analyzes chord progressions from section and role data."""

    def __init__(self) -> None:
        """Initialize the chord analyzer."""
        pass

    def analyze(
        self,
        sections: list[dict[str, Any]],
        roles_by_section: dict[str, list[dict[str, Any]]] | None = None,
    ) -> ChordAnalysisResult:
        """Analyze chord content for the given sections.

        Args:
            sections: List of section dicts (must contain 'id').
            roles_by_section: Optional mapping of section_id to roles with harmony data.

        Returns:
            ChordAnalysisResult containing per-section chord summaries.
        """
        summaries: list[SectionChordSummary] = []

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

            chords: list[ChordLabel] = []
            key_center = _DEFAULT_KEY_CENTER

            # Extract chords from roles if available
            section_roles = (roles_by_section or {}).get(section_id, [])
            seen_chords: set[str] = set()
            for role in section_roles:
                harmony = role.get("harmony")
                if isinstance(harmony, dict) and "chord" in harmony:
                    chord_name = str(harmony["chord"])
                    if chord_name not in seen_chords:
                        seen_chords.add(chord_name)
                        chords.append(
                            {
                                "chord": chord_name,
                                "functionLabel": str(harmony.get("functionLabel", "")),
                                "source": harmony.get("source", "model"),
                            }
                        )

            # Infer key center from the first chord if available
            if chords:
                key_center = _infer_key_center(chords[0]["chord"])

            confidence_level: Literal["low", "medium", "high"] = "medium" if chords else "low"
            confidence_source: Literal["model", "user"] = "model"

            # If any chord has user source, mark as user-sourced
            for chord in chords:
                if chord["source"] == "user":
                    confidence_source = "user"
                    confidence_level = "high"
                    break

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
