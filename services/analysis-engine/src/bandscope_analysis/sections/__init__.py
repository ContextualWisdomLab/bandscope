"""Section extraction components and models.

This package exposes the core models and logic for extracting sections
from arrangement representations, as well as structural segmentation
from audio features.
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
from .segmenter import segment_audio, segment_boundaries_from_audio, segment_with_boundaries
from .utils import validate_section

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
    "segment_audio",
    "segment_boundaries_from_audio",
    "segment_with_boundaries",
    "validate_section",
]
