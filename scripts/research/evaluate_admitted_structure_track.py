#!/usr/bin/env python3
"""Score paired functional ACC on the exact corpus-admission handoff.

This module bridges resource admission to Signal-MIR measurement without
reopening workstation paths. The baseline and candidate segmenters receive the
same immutable canonical PCM memoryview, while the reference segmentation is
parsed from the same immutable admitted annotation snapshot. Scientific corpus
choice, margins, aggregation, uncertainty, and the production feature switch
remain outside this boundary.
"""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from types import ModuleType
from typing import Any

Segmenter = Callable[[memoryview, int, Fraction], Sequence[Any]]


def _load_sibling(filename: str, module_name: str) -> ModuleType:
    """Load one repository-owned sibling script under a stable private module name."""
    existing = sys.modules.get(module_name)
    if existing is not None:
        return existing

    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load research module: {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


_PARSER = _load_sibling(
    "parse_structure_functional_annotations.py",
    "_bandscope_structure_functional_annotations",
)
_EVALUATOR = _load_sibling(
    "evaluate_structure_functional_accuracy.py",
    "_bandscope_structure_functional_accuracy",
)
_LANES = _load_sibling(
    "measure_structure_feature_lanes.py",
    "_bandscope_structure_feature_lanes",
)


@dataclass(frozen=True, slots=True)
class PairedFunctionalAccuracyEvidence:
    """Path-free track evidence bound to exact admitted PCM and annotation bytes."""

    track_id: str
    decoded_pcm_sha256: str
    annotation_sha256: str
    decoded_frames: int
    sample_rate_hz: int
    baseline_accuracy: float
    baseline_correct_frames: int
    baseline_total_frames: int
    candidate_accuracy: float
    candidate_correct_frames: int
    candidate_total_frames: int


def _track_id(value: object) -> str:
    """Return one canonical non-empty track identifier without silent trimming."""
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError("track_id must be non-empty text without surrounding whitespace")
    return value


def _sample_rate(value: object) -> int:
    """Return one positive sample rate while rejecting booleans and coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("sample_rate_hz must be a positive integer")
    return value


def _pcm_shape(decoded_pcm: object) -> tuple[memoryview, int]:
    """Validate the immutable mono-float32 byte shape guaranteed by corpus admission."""
    if not isinstance(decoded_pcm, memoryview) or not decoded_pcm.readonly:
        raise ValueError("decoded PCM must be a read-only memoryview")
    if not decoded_pcm.c_contiguous:
        raise ValueError("decoded PCM must be a contiguous read-only memoryview")
    if decoded_pcm.nbytes == 0 or decoded_pcm.nbytes % 4 != 0:
        raise ValueError("decoded PCM must contain non-empty mono float32 bytes")
    return decoded_pcm, decoded_pcm.nbytes // 4


def _annotation_view(annotation_bytes: object) -> memoryview:
    """Require the immutable annotation snapshot emitted by corpus admission."""
    if not isinstance(annotation_bytes, memoryview) or not annotation_bytes.readonly:
        raise ValueError("annotation input must be a read-only memoryview")
    if not annotation_bytes.c_contiguous:
        raise ValueError("annotation input must be a contiguous read-only memoryview")
    return annotation_bytes


class PairedFunctionalAccuracyTrackConsumer:
    """Collect paired functional ACC evidence from corpus-admission callbacks."""

    def __init__(
        self,
        *,
        baseline_segmenter: Segmenter,
        candidate_segmenter: Segmenter,
    ) -> None:
        """Bind the two preregistered segmentation lanes without track-specific dispatch."""
        if not callable(baseline_segmenter) or not callable(candidate_segmenter):
            raise TypeError("baseline_segmenter and candidate_segmenter must be callable")
        self._baseline_segmenter = baseline_segmenter
        self._candidate_segmenter = candidate_segmenter
        self._evidence: list[PairedFunctionalAccuracyEvidence] = []
        self._measured_track_ids: set[str] = set()

    @classmethod
    def for_registered_cqt_stft_hypothesis(cls) -> PairedFunctionalAccuracyTrackConsumer:
        """Bind the canonical #1225 baseline/candidate feature identities."""
        return cls(
            baseline_segmenter=_LANES.repository_structure_segmenter("cqt"),
            candidate_segmenter=_LANES.repository_structure_segmenter("stft"),
        )

    @property
    def evidence(self) -> tuple[PairedFunctionalAccuracyEvidence, ...]:
        """Return immutable ordered evidence accumulated from admitted tracks."""
        return tuple(self._evidence)

    def __call__(
        self,
        track_id: str,
        decoded_pcm: memoryview,
        annotation_bytes: memoryview,
        sample_rate_hz: int,
    ) -> None:
        """Measure both lanes on one exact admitted signal and normalized annotation."""
        normalized_track_id = _track_id(track_id)
        if normalized_track_id in self._measured_track_ids:
            raise ValueError(f"track_id already measured: {normalized_track_id}")

        pcm, decoded_frames = _pcm_shape(decoded_pcm)
        annotation = _annotation_view(annotation_bytes)
        sample_rate = _sample_rate(sample_rate_hz)
        duration_seconds = Fraction(decoded_frames, sample_rate)

        reference_segments = _PARSER.parse_functional_annotations(
            annotation,
            decoded_frames=decoded_frames,
            sample_rate_hz=sample_rate,
        )
        baseline_segments = tuple(
            self._baseline_segmenter(pcm, sample_rate, duration_seconds)
        )
        candidate_segments = tuple(
            self._candidate_segmenter(pcm, sample_rate, duration_seconds)
        )
        baseline_result = _EVALUATOR.calculate_functional_accuracy(
            reference_segments,
            baseline_segments,
            duration_seconds=duration_seconds,
        )
        candidate_result = _EVALUATOR.calculate_functional_accuracy(
            reference_segments,
            candidate_segments,
            duration_seconds=duration_seconds,
        )

        evidence = PairedFunctionalAccuracyEvidence(
            track_id=normalized_track_id,
            decoded_pcm_sha256=hashlib.sha256(pcm).hexdigest(),
            annotation_sha256=hashlib.sha256(annotation).hexdigest(),
            decoded_frames=decoded_frames,
            sample_rate_hz=sample_rate,
            baseline_accuracy=float(baseline_result.accuracy),
            baseline_correct_frames=int(baseline_result.correct_frames),
            baseline_total_frames=int(baseline_result.total_frames),
            candidate_accuracy=float(candidate_result.accuracy),
            candidate_correct_frames=int(candidate_result.correct_frames),
            candidate_total_frames=int(candidate_result.total_frames),
        )
        self._evidence.append(evidence)
        self._measured_track_ids.add(normalized_track_id)
