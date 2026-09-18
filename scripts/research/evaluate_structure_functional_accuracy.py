#!/usr/bin/env python3
"""Evaluate preregistered functional-label ACC on normalized segments.

This adapter reproduces the time-grid and pointer semantics of the pinned MIREX
2025 standardized evaluator for BandScope's already-normalized seven-label
annotation boundary. It performs no source-vocabulary mapping and no file I/O.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from fractions import Fraction
from typing import Protocol

import numpy as np

OFFICIAL_MIREX_2025_EVALUATOR_COMMIT = (
    "b9fa0b0b32e2145af31f35830f78fc9d09a4301b"
)
FRAME_HOP_SECONDS = 0.2
_ALLOWED_FUNCTIONAL_LABELS = frozenset(
    {"intro", "verse", "chorus", "bridge", "inst", "outro", "silence"}
)


class FunctionalSegmentLike(Protocol):
    """Structural view of the parser-owned functional segment value object."""

    start: Fraction
    end: Fraction
    label: str


@dataclass(frozen=True, slots=True)
class FunctionalAccuracyResult:
    """Deterministic track-level ACC evidence for one normalized segmentation pair."""

    accuracy: float
    correct_frames: int
    total_frames: int
    frame_times_seconds: tuple[float, ...]


def _validate_segments(
    segments: Sequence[FunctionalSegmentLike],
    *,
    duration_seconds: Fraction,
    field: str,
) -> tuple[FunctionalSegmentLike, ...]:
    """Require one continuous full-duration preregistered segmentation."""
    if not segments:
        raise ValueError(f"{field} must contain at least one segment")

    normalized = tuple(segments)
    previous_end = Fraction(0, 1)
    for index, segment in enumerate(normalized):
        if not isinstance(segment.start, Fraction) or not isinstance(segment.end, Fraction):
            raise ValueError(f"{field}[{index}] boundaries must be exact Fractions")
        if segment.label not in _ALLOWED_FUNCTIONAL_LABELS:
            raise ValueError(
                f"{field}[{index}] functional label is not preregistered: "
                f"{segment.label!r}"
            )
        if segment.start != previous_end:
            raise ValueError(f"{field} must be continuous at segment {index}")
        if segment.end <= segment.start:
            raise ValueError(f"{field}[{index}] must have end > start")
        if segment.end > duration_seconds:
            raise ValueError(f"{field}[{index}] exceeds track duration")
        previous_end = segment.end

    if normalized[0].start != 0:
        raise ValueError(f"{field} must start at 0 seconds")
    if previous_end != duration_seconds:
        raise ValueError(f"{field} must cover the full track duration")
    return normalized


def calculate_functional_accuracy(
    reference_segments: Sequence[FunctionalSegmentLike],
    estimated_segments: Sequence[FunctionalSegmentLike],
    *,
    duration_seconds: Fraction,
) -> FunctionalAccuracyResult:
    """Return ACC using the pinned MIREX 2025 200 ms frame-grid semantics.

    The official evaluator constructs frame points with
    ``np.arange(0, gt_duration, 0.2)`` and advances a segment while the frame
    point is greater than or equal to that segment's end. BandScope reproduces
    that behavior only after source labels have been normalized and content-
    addressed by the preregistration boundary.
    """
    if not isinstance(duration_seconds, Fraction) or duration_seconds <= 0:
        raise ValueError("duration_seconds must be a positive Fraction")

    reference = _validate_segments(
        reference_segments,
        duration_seconds=duration_seconds,
        field="reference_segments",
    )
    estimate = _validate_segments(
        estimated_segments,
        duration_seconds=duration_seconds,
        field="estimated_segments",
    )

    frame_times = np.arange(
        0.0,
        float(duration_seconds),
        FRAME_HOP_SECONDS,
        dtype=np.float64,
    )
    reference_index = 0
    estimate_index = 0
    correct_frames = 0

    for frame_time_value in frame_times:
        frame_time = float(frame_time_value)
        while (
            reference_index < len(reference)
            and frame_time >= float(reference[reference_index].end)
        ):
            reference_index += 1
        while (
            estimate_index < len(estimate)
            and frame_time >= float(estimate[estimate_index].end)
        ):
            estimate_index += 1

        if reference_index >= len(reference) or estimate_index >= len(estimate):
            raise ValueError("frame grid exceeded a validated segmentation")
        if reference[reference_index].label == estimate[estimate_index].label:
            correct_frames += 1

    total_frames = int(frame_times.size)
    accuracy = correct_frames / total_frames if total_frames else 0.0
    return FunctionalAccuracyResult(
        accuracy=accuracy,
        correct_frames=correct_frames,
        total_frames=total_frames,
        frame_times_seconds=tuple(float(value) for value in frame_times),
    )
