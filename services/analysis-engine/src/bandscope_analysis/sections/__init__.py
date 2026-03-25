"""Section extraction components and models.

This package exposes the core models and logic for extracting sections
from arrangement representations.
"""

from .anchors import count_based_anchor, lyric_phrase_anchor
from .extractor import extract_sections
from .model import (
    ALL_SECTION_LABELS,
    CueAnchor,
    CueAnchorStrategy,
    SectionCandidate,
    SectionExtractionResult,
    SectionLabel,
)

__all__ = [
    "CueAnchor",
    "CueAnchorStrategy",
    "SectionCandidate",
    "SectionExtractionResult",
    "SectionLabel",
    "ALL_SECTION_LABELS",
    "count_based_anchor",
    "lyric_phrase_anchor",
    "extract_sections",
]
