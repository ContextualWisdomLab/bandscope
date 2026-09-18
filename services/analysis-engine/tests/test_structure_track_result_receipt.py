"""Contracts for canonical track receipts from admitted Signal-MIR evidence."""

from __future__ import annotations

from types import ModuleType, SimpleNamespace

import pytest
from conftest import load_module


def _consumer_module() -> ModuleType:
    """Load the repository-owned admitted-track evidence owner."""
    return load_module(
        "scripts/research/evaluate_admitted_structure_track.py",
        "evaluate_admitted_structure_track_result_receipt",
    )


def _metrics() -> SimpleNamespace:
    """Return one complete normalized segmentation-metric fixture."""
    return SimpleNamespace(
        boundary_precision_0_5=0.91,
        boundary_recall_0_5=0.81,
        boundary_f_0_5=0.857091,
        boundary_precision_3_0=0.96,
        boundary_recall_3_0=0.86,
        boundary_f_3_0=0.907253,
        reference_to_estimate_median_deviation_seconds=0.12,
        estimate_to_reference_median_deviation_seconds=0.15,
        repetition_pairwise_precision=0.88,
        repetition_pairwise_recall=0.78,
        repetition_pairwise_f=0.826988,
    )


def _performance() -> SimpleNamespace:
    """Return one complete preregistered performance fixture."""
    return SimpleNamespace(
        p50_latency_seconds=0.40,
        p95_latency_seconds=0.55,
        peak_rss_mib=480.0,
        measured_trials=20,
    )


def test_canonical_track_receipt_maps_only_registered_measurement_fields() -> None:
    """The experiment path must not hand-author schema-v1 track measurements."""
    module = _consumer_module()
    evidence = module.PairedFunctionalAccuracyEvidence(
        track_id="track-01",
        decoded_pcm_sha256="a" * 64,
        annotation_sha256="b" * 64,
        decoded_frames=44100,
        sample_rate_hz=44100,
        baseline_accuracy=0.93,
        baseline_correct_frames=93,
        baseline_total_frames=100,
        candidate_accuracy=0.92,
        candidate_correct_frames=92,
        candidate_total_frames=100,
        metric_runtime_lock_sha256="c" * 64,
        baseline_segmentation_metrics=module._segmentation_metric_evidence(_metrics()),
        candidate_segmentation_metrics=module._segmentation_metric_evidence(_metrics()),
        performance_contract_id="isolated-single-shot-v1",
        baseline_performance=module._performance_evidence(_performance()),
        candidate_performance=module._performance_evidence(_performance()),
    )

    receipt = module.noninferiority_track_receipt(evidence)

    assert set(receipt) == {"track_id", "baseline", "candidate"}
    assert receipt["track_id"] == "track-01"
    for side_name, expected_accuracy in (("baseline", 0.93), ("candidate", 0.92)):
        side = receipt[side_name]
        assert set(side) == {
            "boundary_f_0_5",
            "boundary_f_3_0",
            "functional_label_accuracy",
            "repetition_pairwise_f",
            "boundary_precision_0_5",
            "boundary_recall_0_5",
            "boundary_precision_3_0",
            "boundary_recall_3_0",
            "repetition_pairwise_precision",
            "repetition_pairwise_recall",
            "reference_to_estimate_median_deviation_seconds",
            "estimate_to_reference_median_deviation_seconds",
            "p50_latency_seconds",
            "p95_latency_seconds",
            "peak_rss_mib",
        }
        assert side["functional_label_accuracy"] == pytest.approx(expected_accuracy)
        assert side["p50_latency_seconds"] == pytest.approx(0.40)
        assert side["p95_latency_seconds"] == pytest.approx(0.55)
        assert side["peak_rss_mib"] == pytest.approx(480.0)


def test_track_receipt_rejects_partial_or_unbound_evidence() -> None:
    """Functional-only or contract-drifted evidence cannot become a result track."""
    module = _consumer_module()
    partial = module.PairedFunctionalAccuracyEvidence(
        track_id="track-01",
        decoded_pcm_sha256="a" * 64,
        annotation_sha256="b" * 64,
        decoded_frames=44100,
        sample_rate_hz=44100,
        baseline_accuracy=0.93,
        baseline_correct_frames=93,
        baseline_total_frames=100,
        candidate_accuracy=0.92,
        candidate_correct_frames=92,
        candidate_total_frames=100,
        metric_runtime_lock_sha256=None,
        baseline_segmentation_metrics=None,
        candidate_segmentation_metrics=None,
        performance_contract_id=None,
        baseline_performance=None,
        candidate_performance=None,
    )

    with pytest.raises(RuntimeError, match="complete canonical quality and performance evidence"):
        module.noninferiority_track_receipt(partial)
