"""Contract for recognized segmentation metrics on the admitted-track handoff."""

from __future__ import annotations

import hashlib
import struct
from fractions import Fraction
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from conftest import load_module

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_RUNTIME_LOCK = (
    _REPOSITORY_ROOT / "services/analysis-engine/requirements-structure-metrics.lock"
)


def _consumer_module() -> ModuleType:
    """Load the repository-owned admitted-track scientific consumer."""
    return load_module(
        "scripts/research/evaluate_admitted_structure_track.py",
        "evaluate_admitted_structure_track_with_metrics",
    )


def _segments(*rows: tuple[str, str, str]) -> tuple[SimpleNamespace, ...]:
    """Build protocol-compatible normalized structural segments."""
    return tuple(
        SimpleNamespace(start=Fraction(start), end=Fraction(end), label=label)
        for start, end, label in rows
    )


def _metric_result(seed: float) -> SimpleNamespace:
    """Return a complete deterministic recognized-metric result fixture."""
    return SimpleNamespace(
        boundary_precision_0_5=seed,
        boundary_recall_0_5=seed,
        boundary_f_0_5=seed,
        boundary_precision_3_0=seed + 0.01,
        boundary_recall_3_0=seed + 0.01,
        boundary_f_3_0=seed + 0.01,
        reference_to_estimate_median_deviation_seconds=0.12,
        estimate_to_reference_median_deviation_seconds=0.15,
        repetition_pairwise_precision=seed + 0.02,
        repetition_pairwise_recall=seed + 0.02,
        repetition_pairwise_f=seed + 0.02,
    )


def _performance_result() -> SimpleNamespace:
    """Return deterministic preregistered performance evidence for focused tests."""
    return SimpleNamespace(
        contract_id="isolated-single-shot-v1",
        baseline=SimpleNamespace(
            p50_latency_seconds=0.80,
            p95_latency_seconds=0.95,
            peak_rss_mib=512.0,
            measured_trials=20,
        ),
        candidate=SimpleNamespace(
            p50_latency_seconds=0.42,
            p95_latency_seconds=0.50,
            peak_rss_mib=480.0,
            measured_trials=20,
        ),
    )


def test_registered_consumer_binds_runtime_lock_and_scores_both_feature_lanes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Canonical CQT/STFT evidence share PCM, annotation, and metric runtime."""
    module = _consumer_module()
    requested_features: list[str] = []
    metric_calls: list[tuple[object, object]] = []

    def repository_segmenter(feature: str) -> Any:
        requested_features.append(feature)

        def segmenter(
            _decoded_pcm: memoryview,
            _sample_rate_hz: int,
            _duration_seconds: Fraction,
        ) -> tuple[SimpleNamespace, ...]:
            if feature == "cqt":
                return _segments(("0", "0.4", "verse"), ("0.4", "0.8", "chorus"))
            return _segments(("0", "0.2", "verse"), ("0.2", "0.8", "chorus"))

        return segmenter

    def metric_evaluator(
        reference_segments: object,
        estimated_segments: object,
    ) -> SimpleNamespace:
        metric_calls.append((reference_segments, estimated_segments))
        return _metric_result(0.70 if len(metric_calls) == 1 else 0.68)

    monkeypatch.setattr(
        module._LANES,
        "repository_structure_segmenter",
        repository_segmenter,
    )
    monkeypatch.setattr(
        module._SEGMENTATION_EVALUATOR,
        "calculate_structure_segmentation_metrics",
        metric_evaluator,
    )
    monkeypatch.setattr(
        module._RUNTIME_VERIFIER,
        "_installed_mir_eval_version",
        lambda: "0.8.2",
    )
    monkeypatch.setattr(
        module._RESOURCE_MEASUREMENT,
        "measure_paired_repository_lane_resources",
        lambda *_args: _performance_result(),
    )

    consumer = (
        module.PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()
    )
    pcm = memoryview(struct.pack("<8f", *([0.0] * 8)))
    annotation = memoryview(b"0.0\t0.4\tverse\n0.4\t0.8\tchorus\n")
    consumer("track-01", pcm, annotation, 10)

    assert requested_features == ["cqt", "stft"]
    assert len(metric_calls) == 2
    assert metric_calls[0][0] is metric_calls[1][0]
    evidence = consumer.evidence[0]
    expected_lock_sha256 = hashlib.sha256(_RUNTIME_LOCK.read_bytes()).hexdigest()
    assert evidence.metric_runtime_lock_sha256 == expected_lock_sha256
    assert evidence.baseline_segmentation_metrics is not None
    assert evidence.candidate_segmentation_metrics is not None
    assert evidence.baseline_segmentation_metrics.boundary_f_0_5 == pytest.approx(0.70)
    assert evidence.candidate_segmentation_metrics.boundary_f_0_5 == pytest.approx(0.68)
    assert evidence.baseline_segmentation_metrics.repetition_pairwise_f == pytest.approx(0.72)
    assert evidence.candidate_segmentation_metrics.repetition_pairwise_f == pytest.approx(0.70)
    assert evidence.performance_contract_id == "isolated-single-shot-v1"


def test_registered_consumer_fails_before_metric_execution_on_runtime_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A drifted installed mir_eval stops scientific metrics before score emission."""
    module = _consumer_module()
    calls: list[str] = []

    def segmenter(
        _decoded_pcm: memoryview,
        _sample_rate_hz: int,
        _duration_seconds: Fraction,
    ) -> tuple[SimpleNamespace, ...]:
        return _segments(("0", "0.4", "verse"))

    monkeypatch.setattr(
        module._LANES,
        "repository_structure_segmenter",
        lambda _feature: segmenter,
    )
    monkeypatch.setattr(
        module._RUNTIME_VERIFIER,
        "_installed_mir_eval_version",
        lambda: "0.8.1",
    )

    def must_not_run(*_args: object) -> object:
        calls.append("metric")
        raise AssertionError("metric evaluator must not run after runtime drift")

    monkeypatch.setattr(
        module._SEGMENTATION_EVALUATOR,
        "calculate_structure_segmentation_metrics",
        must_not_run,
    )
    consumer = (
        module.PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()
    )
    pcm = memoryview(struct.pack("<4f", *([0.0] * 4)))
    annotation = memoryview(b"0.0\t0.4\tverse\n")

    with pytest.raises(RuntimeError, match="requires mir_eval 0.8.2"):
        consumer("track-01", pcm, annotation, 10)

    assert calls == []
    assert consumer.evidence == ()
