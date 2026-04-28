"""Domain model for range analysis."""

from __future__ import annotations

from typing import Literal, TypedDict


class RangeInfo(TypedDict):
    """Range information for a single role."""

    role_id: str
    role_name: str
    lowestNote: str
    highestNote: str


class RangeOverlap(TypedDict):
    """Describes a range overlap between two roles."""

    role_a: str
    role_b: str
    overlap_region: str
    severity: Literal["low", "medium", "high"]


class SectionRangeSummary(TypedDict):
    """Range summary for a single section."""

    section_id: str
    ranges: list[RangeInfo]
    overlaps: list[RangeOverlap]


class RangeAnalysisResult(TypedDict):
    """Result returned by the range analysis pipeline."""

    sections: list[SectionRangeSummary]
    analysis_notes: str
