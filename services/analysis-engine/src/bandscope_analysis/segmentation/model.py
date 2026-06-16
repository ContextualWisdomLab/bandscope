"""Data models for structural segmentation."""

from __future__ import annotations

from typing import Literal, TypedDict


class SegmentBoundary(TypedDict):
    """A single detected segment boundary with its inferred form label."""

    start_sec: float
    end_sec: float
    label: str  # SectionLabel value (e.g. "intro", "verse", "chorus")
    confidence: Literal["low", "medium", "high"]


class SegmentationResult(TypedDict):
    """Result returned by the structural segmenter."""

    boundaries: list[SegmentBoundary]
    duration_seconds: float
    method: str  # "ssm" | "novelty" | "fallback"
    segmentation_notes: str
