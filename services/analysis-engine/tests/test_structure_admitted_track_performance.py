"""Contract for canonical latency/RSS evidence on the admitted-track handoff."""

from __future__ import annotations

import struct
from fractions import Fraction
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from conftest import load_module


def _consumer_module() -> ModuleType:
    """Load the repository-owned admitted-track scientific consumer."""
    return load_module(
        "scripts/research/evaluate_admitted_structure_track.py",
        "evaluate_admitted_structure_track_with_performance",
    )


def _segments() -> tuple[SimpleNamespace, ...]:
    """Return one full-duration protocol-compatible segment."""
    return (SimpleNamespace(start=Fraction(0), end=Fraction(4, 5), label="verse"),)


def _metric_result() -> SimpleNamespace:
    """Return a complete recognized-metric fixture."""
    return SimpleNamespace(
        boundary_precision_0_5=1.0,
        boundary_recall_0_5=1.0,
        boundary_f_0_5=1.0,
        boundary_precision_3_0=1.0,
        boundary_recall_3_0=1.0,
        boundary_f_3_0=1.0,
        reference_to_estimate_median_deviation_seconds=0.0,
        estimate_to_reference_median_deviation_seconds=0.0,
        repetition_pairwise_precision=1.0,
        repetition_pairwise_recall=1.0,
        repetition_pairwise_f=1.0,
    )


def test_registered_consumer_records_canonical_performance_on_same_admitted_pcm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Canonical evidence must include preregistered p50/p95/RSS for both lanes."""
    module = _consumer_module()
    performance_calls: list[tuple[memoryview, int, Fraction]] = []

    def segmenter(
        _decoded_pcm: memoryview,
        _sample_rate_hz: int,
        _duration_seconds: Fraction,
    ) -> tuple[SimpleNamespace, ...]:
        return _segments()

    monkeypatch.setattr(
        module._LANES,
        "repository_structure_segmenter",
        lambda _feature: segmenter,
    )
    monkeypatch.setattr(
        module._SEGMENTATION_EVALUATOR,
        "calculate_structure_segmentation_metrics",
        lambda _reference, _estimated: _metric_result(),
    )
    monkeypatch.setattr(
        module._RUNTIME_VERIFIER,
        "_installed_mir_eval_version",
        lambda: "0.8.2",
    )

    def fake_performance(
        decoded_pcm: memoryview,
        sample_rate_hz: int,
        duration_seconds: Fraction,
    ) -> object:
        performance_calls.append((decoded_pcm, sample_rate_hz, duration_seconds))
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

    monkeypatch.setattr(
        module._RESOURCE_MEASUREMENT,
        "measure_paired_repository_lane_resources",
        fake_performance,
    )

    consumer = module.PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()
    pcm = memoryview(struct.pack("<8f", *([0.0] * 8)))
    annotation = memoryview(b"0.0\t0.8\tverse\n")
    consumer("track-01", pcm, annotation, 10)

    assert performance_calls == [(pcm, 10, Fraction(4, 5))]
    evidence = consumer.evidence[0]
    assert evidence.performance_contract_id == "isolated-single-shot-v1"
    assert evidence.baseline_performance is not None
    assert evidence.candidate_performance is not None
    assert evidence.baseline_performance.p50_latency_seconds == pytest.approx(0.80)
    assert evidence.baseline_performance.p95_latency_seconds == pytest.approx(0.95)
    assert evidence.baseline_performance.peak_rss_mib == pytest.approx(512.0)
    assert evidence.baseline_performance.measured_trials == 20
    assert evidence.candidate_performance.p50_latency_seconds == pytest.approx(0.42)
    assert evidence.candidate_performance.p95_latency_seconds == pytest.approx(0.50)
    assert evidence.candidate_performance.peak_rss_mib == pytest.approx(480.0)


def test_custom_consumer_requires_performance_evaluator_and_contract_together() -> None:
    """Caller injection cannot produce unbound resource evidence."""
    module = _consumer_module()

    def segmenter(
        _decoded_pcm: memoryview,
        _sample_rate_hz: int,
        _duration_seconds: Fraction,
    ) -> tuple[Any, ...]:
        return _segments()

    with pytest.raises(ValueError, match="performance evaluator and contract identity"):
        module.PairedFunctionalAccuracyTrackConsumer(
            baseline_segmenter=segmenter,
            candidate_segmenter=segmenter,
            performance_evaluator=lambda *_args: object(),
        )
