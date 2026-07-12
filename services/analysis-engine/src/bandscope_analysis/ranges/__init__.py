"""Range analysis module for detecting pitch ranges and overlaps."""

from .analyzer import RangeAnalyzer
from .model import (
    RangeAnalysisResult,
    RangeInfo,
    RangeOverlap,
    SectionRangeSummary,
)
from .pitch_tracker import PitchTracker, TrackedPitchRange
from .pressure import (
    RangePressureResult,
    analyze_range_pressure,
    analyze_range_pressure_from_audio,
)

__all__ = [
    "PitchTracker",
    "RangeAnalyzer",
    "RangePressureResult",
    "analyze_range_pressure",
    "analyze_range_pressure_from_audio",
    "RangeAnalysisResult",
    "RangeInfo",
    "RangeOverlap",
    "SectionRangeSummary",
    "TrackedPitchRange",
]
