"""Pipeline logic for extracting section candidates from song arrangements."""

import re
from typing import Dict, List, Literal

from .anchors import count_based_anchor, lyric_phrase_anchor
from .model import (
    ALL_SECTION_LABELS,
    RawArrangementItem,
    SectionCandidate,
    SectionExtractionResult,
)

# Sort by length descending to match longest possible prefix first if needed,
# though ALL_SECTION_LABELS currently are distinct.
_sorted_labels = sorted(ALL_SECTION_LABELS, key=len, reverse=True)
_LABEL_PREFIX_PATTERN = re.compile(
    r"^(" + "|".join(re.escape(label) for label in _sorted_labels) + r")"
)


def _normalize_label(raw_label: str) -> str:
    """Normalize a string to a SectionLabel if possible."""
    normalized = str(raw_label).lower().strip()
    # Handle variations (e.g. "verse 1" -> "verse")
    match = _LABEL_PREFIX_PATTERN.match(normalized)
    if match:
        return match.group(1)
    return normalized


def extract_sections(arrangement: List[RawArrangementItem]) -> SectionExtractionResult:
    """
    Extract structured section candidates from raw arrangement data.

    Expects arrangement list of dicts with at least:
    - label: str
    - groove: str (optional)
    - lyric_cue: str (optional)
    """
    sections: List[SectionCandidate] = []

    # Determine dominant strategy: if any item has lyric_cue, use LYRIC strategy
    has_lyrics = any(item.get("lyric_cue") for item in arrangement)
    dominant_strategy = "lyric" if has_lyrics else "count"

    label_counts: Dict[str, int] = {}

    for item in arrangement:
        raw_label = item.get("label", "unknown")
        form_label = _normalize_label(raw_label)

        # Track sequence index per form label (e.g. verse-1, verse-2)
        # Note: we want 1-based index but the type implies we just count them
        label_counts[form_label] = label_counts.get(form_label, 0) + 1
        sequence_index = label_counts[form_label]

        section_id = f"{form_label}-{sequence_index}"

        # Determine confidence
        confidence_level: Literal["low", "medium", "high"] = "low"
        confidence_source: Literal["model", "user"] = "model"

        if form_label in ALL_SECTION_LABELS:
            confidence_level = "high"
            confidence_source = "model"
            confidence_notes = "Recognized standard section label"
        else:
            confidence_level = "low"
            confidence_source = "model"
            confidence_notes = "Unrecognized section label"

        # Create anchor
        if has_lyrics and "lyric_cue" in item and item["lyric_cue"]:
            anchor = lyric_phrase_anchor(item["lyric_cue"])
        else:
            # Fallback or default count anchor
            anchor = count_based_anchor(beat=1, bar=1)

        candidate: SectionCandidate = {
            "id": section_id,
            "form_label": form_label,
            "sequence_index": sequence_index,
            "groove": item.get("groove", "standard"),
            "confidence_level": confidence_level,
            "confidence_source": confidence_source,
            "confidence_notes": confidence_notes,
            "cue_anchor": anchor,
        }
        sections.append(candidate)

    return {
        "sections": sections,
        "strategy_used": dominant_strategy,
        "extraction_notes": f"Extracted {len(sections)} sections using {dominant_strategy}.",
    }
