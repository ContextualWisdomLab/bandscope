"""Range analysis module for detecting pitch ranges and overlaps."""

from .analyzer import RangeAnalyzer
from .model import (
    RangeAnalysisResult,
    RangeInfo,
    RangeOverlap,
    SectionRangeSummary,
)
from .pitch_tracker import PitchTracker, TrackedPitchRange

__all__ = [
    "PitchTracker",
    "RangeAnalyzer",
    "RangeAnalysisResult",
    "RangeInfo",
    "RangeOverlap",
    "SectionRangeSummary",
    "TrackedPitchRange",
]
