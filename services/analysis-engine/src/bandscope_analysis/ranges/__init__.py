"""Range analysis module for detecting pitch ranges and overlaps."""

from .analyzer import RangeAnalyzer
from .model import (
    RangeAnalysisResult,
    RangeInfo,
    RangeOverlap,
    SectionRangeSummary,
)

__all__ = [
    "RangeAnalyzer",
    "RangeAnalysisResult",
    "RangeInfo",
    "RangeOverlap",
    "SectionRangeSummary",
]
