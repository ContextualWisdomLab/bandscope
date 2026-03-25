"""Domain model for section/form/cue anchor extraction."""

from __future__ import annotations

from enum import Enum
from typing import Literal, TypedDict


class SectionLabel(str, Enum):
    """Canonical form labels for song sections.

    These labels cover the rehearsal-relevant structural vocabulary for
    contemporary popular, jazz, gospel, and R&B arrangements.
    """

    INTRO = "intro"
    VERSE = "verse"
    PRE_CHORUS = "pre-chorus"
    CHORUS = "chorus"
    BRIDGE = "bridge"
    OUTRO = "outro"
    TAG = "tag"
    PICKUP = "pickup"
    STOP = "stop"
    HANDOFF = "handoff"


# All canonical labels as a plain tuple for iteration and validation.
ALL_SECTION_LABELS: tuple[str, ...] = tuple(label.value for label in SectionLabel)


class CueAnchorStrategy(str, Enum):
    """Strategy used to anchor a section cue."""

    LYRIC = "lyric"
    COUNT = "count"
    TRANSITION = "transition"


class CueAnchor(TypedDict):
    """A rehearsal cue anchor tied to a specific entry strategy."""

    strategy: str  # CueAnchorStrategy value
    value: str


class SectionCandidate(TypedDict):
    """A single candidate section produced during extraction.

    ``form_label`` is a ``SectionLabel`` value string.
    ``sequence_index`` is the zero-based position in the arrangement.
    ``confidence_level`` is one of ``"low" | "medium" | "high"``.
    ``confidence_source`` is always ``"model"`` for extracted sections.
    ``confidence_notes`` is a human-readable explanation.
    ``groove`` is a brief textual groove descriptor for rehearsal reference.
    ``cue_anchor`` is the primary entry cue for this section.
    ``id`` is a stable slug derived from label and sequence index.
    """

    id: str
    form_label: str  # SectionLabel value
    sequence_index: int
    groove: str
    confidence_level: Literal["low", "medium", "high"]
    confidence_source: Literal["model", "user"]
    confidence_notes: str
    cue_anchor: CueAnchor


class SectionExtractionResult(TypedDict):
    """Result returned by the section extraction pipeline.

    ``sections`` is an ordered list of ``SectionCandidate`` objects.
    ``strategy_used`` records which anchor strategy dominated.
    ``extraction_notes`` provides overall pipeline commentary.
    """

    sections: list[SectionCandidate]
    strategy_used: str  # CueAnchorStrategy value
    extraction_notes: str
