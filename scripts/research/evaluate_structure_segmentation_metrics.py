#!/usr/bin/env python3
"""Evaluate preregistered structure boundary and repetition metrics.

This adapter consumes normalized in-memory segment values produced from the
admitted corpus handoff. It deliberately does not read paths, remap labels, or
choose experiment margins, aggregation, or uncertainty. The scientific metric
backend is pinned to mir_eval 0.8.2 and every non-default argument that affects
the registered result is supplied explicitly.

Security Notes:
- Inputs are normalized segment value objects; no filesystem, network,
  subprocess, model-download, or plugin-loading path is exposed.
- Dependency drift fails closed before metric execution.
- Malformed, discontinuous, or duration-mismatched segmentations are rejected
  rather than repaired inside the evaluator.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import math
from collections.abc import Sequence
from dataclasses import dataclass
from fractions import Fraction
from types import ModuleType
from typing import Any

import numpy as np

MIR_EVAL_VERSION = "0.8.2"
BOUNDARY_WINDOWS_SECONDS = (0.5, 3.0)
BOUNDARY_BETA = 1.0
BOUNDARY_TRIM = True
PAIRWISE_FRAME_SIZE_SECONDS = 0.1
PAIRWISE_BETA = 1.0


@dataclass(frozen=True, slots=True)
class StructureSegmentationMetrics:
    """Track-level recognized boundary, deviation, and repetition measurements."""

    boundary_precision_0_5: float
    boundary_recall_0_5: float
    boundary_f_0_5: float
    boundary_precision_3_0: float
    boundary_recall_3_0: float
    boundary_f_3_0: float
    reference_to_estimate_median_deviation_seconds: float
    estimate_to_reference_median_deviation_seconds: float
    repetition_pairwise_precision: float
    repetition_pairwise_recall: float
    repetition_pairwise_f: float


def _load_mir_eval() -> ModuleType:
    """Load the reviewed metric package only when scientific evaluation runs."""
    try:
        return importlib.import_module("mir_eval")
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            f"mir_eval {MIR_EVAL_VERSION} is required for structure metric evaluation"
        ) from exc


def _mir_eval_version() -> str:
    """Return installed distribution identity instead of trusting module globals."""
    try:
        return importlib.metadata.version("mir_eval")
    except importlib.metadata.PackageNotFoundError as exc:
        raise RuntimeError(
            f"mir_eval {MIR_EVAL_VERSION} is required for structure metric evaluation"
        ) from exc


def _boundary(value: object, field: str) -> Fraction:
    """Return one finite exact boundary without bool or string coercion."""
    if isinstance(value, bool) or not isinstance(value, (int, float, Fraction)):
        raise ValueError(f"{field} must be a finite numeric boundary")
    if isinstance(value, Fraction):
        return value
    numeric = float(value)
    if not math.isfinite(numeric):
        raise ValueError(f"{field} must be a finite numeric boundary")
    return Fraction(str(numeric))


def _normalize_segments(
    raw_segments: object,
    field: str,
) -> tuple[np.ndarray[Any, np.dtype[np.float64]], list[str], Fraction]:
    """Validate one complete normalized segmentation for recognized metrics."""
    if isinstance(raw_segments, (str, bytes)) or not isinstance(raw_segments, Sequence):
        raise ValueError(f"{field} must be a segment sequence")
    if len(raw_segments) < 2:
        raise ValueError(f"{field} must contain at least two structural segments")

    intervals: list[tuple[float, float]] = []
    labels: list[str] = []
    previous_end = Fraction(0, 1)
    for index, segment in enumerate(raw_segments):
        start = _boundary(getattr(segment, "start", None), f"{field}[{index}].start")
        end = _boundary(getattr(segment, "end", None), f"{field}[{index}].end")
        label = getattr(segment, "label", None)
        if not isinstance(label, str) or not label:
            raise ValueError(f"{field}[{index}].label must be non-empty text")
        if start != previous_end:
            raise ValueError(f"{field} must be continuous from zero without gaps or overlaps")
        if end <= start:
            raise ValueError(f"{field}[{index}] must have positive duration")
        intervals.append((float(start), float(end)))
        labels.append(label)
        previous_end = end

    return np.asarray(intervals, dtype=np.float64), labels, previous_end


def _score(value: object, field: str) -> float:
    """Return one finite metric score in the closed 0..1 interval."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RuntimeError(f"{field} returned a non-numeric score")
    score = float(value)
    if not math.isfinite(score) or not 0.0 <= score <= 1.0:
        raise RuntimeError(f"{field} returned a score outside 0..1")
    return score


def _deviation(value: object, field: str) -> float:
    """Return one finite non-negative boundary-deviation measurement."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RuntimeError(f"{field} returned a non-numeric deviation")
    deviation = float(value)
    if not math.isfinite(deviation) or deviation < 0.0:
        raise RuntimeError(f"{field} returned an invalid deviation")
    return deviation


def calculate_structure_segmentation_metrics(
    reference_segments: object,
    estimated_segments: object,
) -> StructureSegmentationMetrics:
    """Evaluate one normalized estimate with the frozen mir_eval 0.8.2 contract.

    ``trim=True`` intentionally removes the shared start/end markers from boundary
    hit-rate and deviation scoring. Those markers are guaranteed by the normalized
    full-duration segment contract and would otherwise add two trivial hits that do
    not measure a model's ability to locate internal rehearsal structure.
    """
    reference_intervals, reference_labels, reference_duration = _normalize_segments(
        reference_segments,
        "reference_segments",
    )
    estimated_intervals, estimated_labels, estimated_duration = _normalize_segments(
        estimated_segments,
        "estimated_segments",
    )
    if reference_duration != estimated_duration:
        raise ValueError("reference and estimated segmentations must cover the same duration")

    backend = _load_mir_eval()
    observed_version = _mir_eval_version()
    if observed_version != MIR_EVAL_VERSION:
        raise RuntimeError(
            f"structure metrics require mir_eval {MIR_EVAL_VERSION}; "
            f"observed {observed_version}"
        )

    segment = getattr(backend, "segment", None)
    if segment is None:
        raise RuntimeError("mir_eval segment metric module is unavailable")

    p_05, r_05, f_05 = segment.detection(
        reference_intervals,
        estimated_intervals,
        window=BOUNDARY_WINDOWS_SECONDS[0],
        beta=BOUNDARY_BETA,
        trim=BOUNDARY_TRIM,
    )
    p_3, r_3, f_3 = segment.detection(
        reference_intervals,
        estimated_intervals,
        window=BOUNDARY_WINDOWS_SECONDS[1],
        beta=BOUNDARY_BETA,
        trim=BOUNDARY_TRIM,
    )
    reference_to_estimate, estimate_to_reference = segment.deviation(
        reference_intervals,
        estimated_intervals,
        trim=BOUNDARY_TRIM,
    )
    pairwise_precision, pairwise_recall, pairwise_f = segment.pairwise(
        reference_intervals,
        reference_labels,
        estimated_intervals,
        estimated_labels,
        frame_size=PAIRWISE_FRAME_SIZE_SECONDS,
        beta=PAIRWISE_BETA,
    )

    return StructureSegmentationMetrics(
        boundary_precision_0_5=_score(p_05, "boundary precision at 0.5 s"),
        boundary_recall_0_5=_score(r_05, "boundary recall at 0.5 s"),
        boundary_f_0_5=_score(f_05, "boundary F at 0.5 s"),
        boundary_precision_3_0=_score(p_3, "boundary precision at 3.0 s"),
        boundary_recall_3_0=_score(r_3, "boundary recall at 3.0 s"),
        boundary_f_3_0=_score(f_3, "boundary F at 3.0 s"),
        reference_to_estimate_median_deviation_seconds=_deviation(
            reference_to_estimate,
            "reference-to-estimate boundary deviation",
        ),
        estimate_to_reference_median_deviation_seconds=_deviation(
            estimate_to_reference,
            "estimate-to-reference boundary deviation",
        ),
        repetition_pairwise_precision=_score(
            pairwise_precision,
            "repetition pairwise precision",
        ),
        repetition_pairwise_recall=_score(
            pairwise_recall,
            "repetition pairwise recall",
        ),
        repetition_pairwise_f=_score(pairwise_f, "repetition pairwise F"),
    )
