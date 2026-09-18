#!/usr/bin/env python3
"""Score paired structure evidence on the exact corpus-admission handoff.

This module bridges resource admission to Signal-MIR measurement without
reopening workstation paths. The baseline and candidate segmenters receive the
same immutable canonical PCM memoryview, while the reference segmentation is
parsed from the same immutable admitted annotation snapshot. The canonical
CQT/STFT experiment additionally evaluates the reviewed mir_eval boundary,
deviation, repetition, and isolated single-shot latency/RSS contracts.
Scientific corpus choice, margins, aggregation, uncertainty, and the production
feature switch remain outside this boundary.
"""

from __future__ import annotations

import hashlib
import importlib.util
import math
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from types import ModuleType
from typing import Any

Segmenter = Callable[[memoryview, int, Fraction], Sequence[Any]]
SegmentationMetricEvaluator = Callable[[object, object], object]
PerformanceEvaluator = Callable[[memoryview, int, Fraction], object]
_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_STRUCTURE_METRIC_RUNTIME_LOCK = (
    _REPOSITORY_ROOT / "services/analysis-engine/requirements-structure-metrics.lock"
)


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
_SEGMENTATION_EVALUATOR = _load_sibling(
    "evaluate_structure_segmentation_metrics.py",
    "_bandscope_structure_segmentation_metrics",
)
_RUNTIME_VERIFIER = _load_sibling(
    "verify_structure_metric_runtime_lock.py",
    "_bandscope_structure_metric_runtime_lock",
)
_RESOURCE_MEASUREMENT = _load_sibling(
    "measure_structure_lane_resources.py",
    "_bandscope_structure_lane_resources",
)


@dataclass(frozen=True, slots=True)
class StructureSegmentationMetricEvidence:
    """Recognized track-level boundary, deviation, and repetition evidence."""

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


@dataclass(frozen=True, slots=True)
class StructurePerformanceEvidence:
    """Preregistered per-track single-shot latency quantiles and peak process RSS."""

    p50_latency_seconds: float
    p95_latency_seconds: float
    peak_rss_mib: float
    measured_trials: int


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
    metric_runtime_lock_sha256: str | None
    baseline_segmentation_metrics: StructureSegmentationMetricEvidence | None
    candidate_segmentation_metrics: StructureSegmentationMetricEvidence | None
    performance_contract_id: str | None
    baseline_performance: StructurePerformanceEvidence | None
    candidate_performance: StructurePerformanceEvidence | None


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


def _segmentation_metric_evidence(result: object) -> StructureSegmentationMetricEvidence:
    """Copy the reviewed adapter result into the consumer-owned immutable receipt."""
    return StructureSegmentationMetricEvidence(
        boundary_precision_0_5=float(getattr(result, "boundary_precision_0_5")),
        boundary_recall_0_5=float(getattr(result, "boundary_recall_0_5")),
        boundary_f_0_5=float(getattr(result, "boundary_f_0_5")),
        boundary_precision_3_0=float(getattr(result, "boundary_precision_3_0")),
        boundary_recall_3_0=float(getattr(result, "boundary_recall_3_0")),
        boundary_f_3_0=float(getattr(result, "boundary_f_3_0")),
        reference_to_estimate_median_deviation_seconds=float(
            getattr(result, "reference_to_estimate_median_deviation_seconds")
        ),
        estimate_to_reference_median_deviation_seconds=float(
            getattr(result, "estimate_to_reference_median_deviation_seconds")
        ),
        repetition_pairwise_precision=float(getattr(result, "repetition_pairwise_precision")),
        repetition_pairwise_recall=float(getattr(result, "repetition_pairwise_recall")),
        repetition_pairwise_f=float(getattr(result, "repetition_pairwise_f")),
    )


def _performance_evidence(result: object) -> StructurePerformanceEvidence:
    """Validate and copy one lane's isolated performance summary."""
    p50 = float(getattr(result, "p50_latency_seconds"))
    p95 = float(getattr(result, "p95_latency_seconds"))
    peak_rss = float(getattr(result, "peak_rss_mib"))
    measured_trials = getattr(result, "measured_trials")
    if not all(math.isfinite(value) and value > 0.0 for value in (p50, p95, peak_rss)):
        raise RuntimeError("structure performance evidence must be finite and positive")
    if p95 < p50:
        raise RuntimeError("structure performance p95 must be greater than or equal to p50")
    if isinstance(measured_trials, bool) or not isinstance(measured_trials, int):
        raise RuntimeError("structure performance measured_trials must be an integer")
    expected_trials = _RESOURCE_MEASUREMENT.PERFORMANCE_MEASUREMENT_CONTRACT[
        "measured_trials"
    ]
    if measured_trials != expected_trials:
        raise RuntimeError("structure performance measured_trials drifted from contract")
    return StructurePerformanceEvidence(
        p50_latency_seconds=p50,
        p95_latency_seconds=p95,
        peak_rss_mib=peak_rss,
        measured_trials=measured_trials,
    )


class PairedFunctionalAccuracyTrackConsumer:
    """Collect paired structure evidence from corpus-admission callbacks."""

    def __init__(
        self,
        *,
        baseline_segmenter: Segmenter,
        candidate_segmenter: Segmenter,
        segmentation_metric_evaluator: SegmentationMetricEvaluator | None = None,
        metric_runtime_lock_sha256: str | None = None,
        performance_evaluator: PerformanceEvaluator | None = None,
        performance_contract_id: str | None = None,
    ) -> None:
        """Bind preregistered quality lanes and optional performance evidence."""
        if not callable(baseline_segmenter) or not callable(candidate_segmenter):
            raise TypeError("baseline_segmenter and candidate_segmenter must be callable")
        if (segmentation_metric_evaluator is None) != (metric_runtime_lock_sha256 is None):
            raise ValueError(
                "segmentation metric evaluator and metric runtime lock identity must be bound together"
            )
        if segmentation_metric_evaluator is not None and not callable(
            segmentation_metric_evaluator
        ):
            raise TypeError("segmentation_metric_evaluator must be callable")
        if (performance_evaluator is None) != (performance_contract_id is None):
            raise ValueError(
                "performance evaluator and contract identity must be bound together"
            )
        if performance_evaluator is not None and not callable(performance_evaluator):
            raise TypeError("performance_evaluator must be callable")
        if performance_contract_id is not None and (
            not isinstance(performance_contract_id, str) or not performance_contract_id
        ):
            raise ValueError("performance_contract_id must be non-empty text")
        self._baseline_segmenter = baseline_segmenter
        self._candidate_segmenter = candidate_segmenter
        self._segmentation_metric_evaluator = segmentation_metric_evaluator
        self._metric_runtime_lock_sha256 = metric_runtime_lock_sha256
        self._performance_evaluator = performance_evaluator
        self._performance_contract_id = performance_contract_id
        self._evidence: list[PairedFunctionalAccuracyEvidence] = []
        self._measured_track_ids: set[str] = set()

    @classmethod
    def for_registered_cqt_stft_hypothesis(cls) -> PairedFunctionalAccuracyTrackConsumer:
        """Bind canonical CQT/STFT quality and performance measurement contracts."""
        runtime_identity = _RUNTIME_VERIFIER.load_structure_metric_runtime_lock_identity(
            _STRUCTURE_METRIC_RUNTIME_LOCK
        )
        performance_contract_id = _RESOURCE_MEASUREMENT.PERFORMANCE_MEASUREMENT_CONTRACT[
            "contract_id"
        ]
        if not isinstance(performance_contract_id, str) or not performance_contract_id:
            raise RuntimeError("structure performance contract_id is invalid")
        return cls(
            baseline_segmenter=_LANES.repository_structure_segmenter("cqt"),
            candidate_segmenter=_LANES.repository_structure_segmenter("stft"),
            segmentation_metric_evaluator=(
                _SEGMENTATION_EVALUATOR.calculate_structure_segmentation_metrics
            ),
            metric_runtime_lock_sha256=runtime_identity.lock_sha256,
            performance_evaluator=(
                _RESOURCE_MEASUREMENT.measure_paired_repository_lane_resources
            ),
            performance_contract_id=performance_contract_id,
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

        baseline_segmentation_metrics: StructureSegmentationMetricEvidence | None = None
        candidate_segmentation_metrics: StructureSegmentationMetricEvidence | None = None
        metric_runtime_lock_sha256: str | None = None
        if self._segmentation_metric_evaluator is not None:
            runtime_identity = _RUNTIME_VERIFIER.verify_structure_metric_runtime_lock(
                _STRUCTURE_METRIC_RUNTIME_LOCK
            )
            if runtime_identity.lock_sha256 != self._metric_runtime_lock_sha256:
                raise RuntimeError(
                    "structure metric runtime lock changed after experiment binding"
                )
            baseline_segmentation_metrics = _segmentation_metric_evidence(
                self._segmentation_metric_evaluator(
                    reference_segments,
                    baseline_segments,
                )
            )
            candidate_segmentation_metrics = _segmentation_metric_evidence(
                self._segmentation_metric_evaluator(
                    reference_segments,
                    candidate_segments,
                )
            )
            metric_runtime_lock_sha256 = runtime_identity.lock_sha256

        performance_contract_id: str | None = None
        baseline_performance: StructurePerformanceEvidence | None = None
        candidate_performance: StructurePerformanceEvidence | None = None
        if self._performance_evaluator is not None:
            performance = self._performance_evaluator(
                pcm,
                sample_rate,
                duration_seconds,
            )
            observed_contract = getattr(performance, "contract_id", None)
            if observed_contract != self._performance_contract_id:
                raise RuntimeError("structure performance contract identity drifted")
            baseline_performance = _performance_evidence(
                getattr(performance, "baseline")
            )
            candidate_performance = _performance_evidence(
                getattr(performance, "candidate")
            )
            performance_contract_id = self._performance_contract_id

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
            metric_runtime_lock_sha256=metric_runtime_lock_sha256,
            baseline_segmentation_metrics=baseline_segmentation_metrics,
            candidate_segmentation_metrics=candidate_segmentation_metrics,
            performance_contract_id=performance_contract_id,
            baseline_performance=baseline_performance,
            candidate_performance=candidate_performance,
        )
        self._evidence.append(evidence)
        self._measured_track_ids.add(normalized_track_id)
