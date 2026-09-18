"""Tests for preregistered paired-track aggregation and bootstrap uncertainty."""

from __future__ import annotations

from types import ModuleType

import pytest
from conftest import load_module


def _aggregation() -> ModuleType:
    return load_module(
        "scripts/research/aggregate_structure_noninferiority.py",
        "aggregate_structure_noninferiority",
    )


def _side(
    *,
    boundary_precision: float,
    boundary_recall: float,
    functional_accuracy: float,
    repetition_precision: float,
    repetition_recall: float,
    p50_latency: float,
    p95_latency: float,
    peak_rss: float,
) -> dict[str, float]:
    harmonic_boundary = (
        0.0
        if boundary_precision + boundary_recall == 0.0
        else 2.0 * boundary_precision * boundary_recall
        / (boundary_precision + boundary_recall)
    )
    harmonic_repetition = (
        0.0
        if repetition_precision + repetition_recall == 0.0
        else 2.0 * repetition_precision * repetition_recall
        / (repetition_precision + repetition_recall)
    )
    return {
        "boundary_precision_0_5": boundary_precision,
        "boundary_recall_0_5": boundary_recall,
        "boundary_f_0_5": harmonic_boundary,
        "boundary_precision_3_0": boundary_precision,
        "boundary_recall_3_0": boundary_recall,
        "boundary_f_3_0": harmonic_boundary,
        "reference_to_estimate_median_deviation_seconds": 0.2,
        "estimate_to_reference_median_deviation_seconds": 0.25,
        "functional_label_accuracy": functional_accuracy,
        "repetition_pairwise_precision": repetition_precision,
        "repetition_pairwise_recall": repetition_recall,
        "repetition_pairwise_f": harmonic_repetition,
        "p50_latency_seconds": p50_latency,
        "p95_latency_seconds": p95_latency,
        "peak_rss_mib": peak_rss,
    }


def _tracks() -> list[dict[str, object]]:
    return [
        {
            "track_id": "track-a",
            "baseline": _side(
                boundary_precision=0.80,
                boundary_recall=0.60,
                functional_accuracy=0.70,
                repetition_precision=0.75,
                repetition_recall=0.65,
                p50_latency=4.0,
                p95_latency=6.0,
                peak_rss=600.0,
            ),
            "candidate": _side(
                boundary_precision=0.78,
                boundary_recall=0.62,
                functional_accuracy=0.71,
                repetition_precision=0.74,
                repetition_recall=0.66,
                p50_latency=2.0,
                p95_latency=4.0,
                peak_rss=580.0,
            ),
        },
        {
            "track_id": "track-b",
            "baseline": _side(
                boundary_precision=0.60,
                boundary_recall=0.80,
                functional_accuracy=0.74,
                repetition_precision=0.65,
                repetition_recall=0.75,
                p50_latency=5.0,
                p95_latency=8.0,
                peak_rss=650.0,
            ),
            "candidate": _side(
                boundary_precision=0.62,
                boundary_recall=0.78,
                functional_accuracy=0.73,
                repetition_precision=0.66,
                repetition_recall=0.74,
                p50_latency=2.5,
                p95_latency=5.0,
                peak_rss=610.0,
            ),
        },
        {
            "track_id": "track-c",
            "baseline": _side(
                boundary_precision=0.70,
                boundary_recall=0.70,
                functional_accuracy=0.72,
                repetition_precision=0.70,
                repetition_recall=0.70,
                p50_latency=4.5,
                p95_latency=7.0,
                peak_rss=625.0,
            ),
            "candidate": _side(
                boundary_precision=0.70,
                boundary_recall=0.70,
                functional_accuracy=0.72,
                repetition_precision=0.70,
                repetition_recall=0.70,
                p50_latency=2.25,
                p95_latency=4.5,
                peak_rss=595.0,
            ),
        },
    ]


def test_macro_track_aggregation_recomputes_f_and_preserves_worst_peak_memory() -> None:
    aggregation = _aggregation()

    evidence = aggregation.aggregate_complete_track_measurements(
        _tracks(),
        uncertainty={
            "procedure_id": "paired-track-bootstrap-v1",
            "confidence_level": 0.95,
            "resamples": 1000,
            "random_seed": 20260918,
        },
    )

    baseline = evidence["aggregate"]["baseline"]
    candidate = evidence["aggregate"]["candidate"]
    assert baseline["boundary_precision_0_5"] == pytest.approx(0.70)
    assert baseline["boundary_recall_0_5"] == pytest.approx(0.70)
    assert baseline["boundary_f_0_5"] == pytest.approx(0.70)
    assert candidate["functional_label_accuracy"] == pytest.approx(0.72)
    assert baseline["p95_latency_seconds"] == pytest.approx(7.0)
    assert candidate["p95_latency_seconds"] == pytest.approx(4.5)
    assert baseline["peak_rss_mib"] == pytest.approx(650.0)
    assert candidate["peak_rss_mib"] == pytest.approx(610.0)


def test_paired_bootstrap_is_deterministic_and_resamples_track_pairs() -> None:
    aggregation = _aggregation()
    uncertainty = {
        "procedure_id": "paired-track-bootstrap-v1",
        "confidence_level": 0.95,
        "resamples": 1000,
        "random_seed": 7,
    }

    first = aggregation.aggregate_complete_track_measurements(
        _tracks(), uncertainty=uncertainty
    )
    second = aggregation.aggregate_complete_track_measurements(
        _tracks(), uncertainty=uncertainty
    )

    assert first == second
    assert set(first["paired_delta_ci95"]) == {
        "boundary_f_0_5",
        "boundary_f_3_0",
        "functional_label_accuracy",
        "repetition_pairwise_f",
    }
    assert len(first["p95_latency_ratio_ci95"]) == 2
    assert first["p95_latency_ratio_ci95"][0] > 0.0


def test_aggregation_fails_closed_on_duplicate_tracks_or_unsupported_uncertainty() -> None:
    aggregation = _aggregation()
    duplicate = _tracks()
    duplicate[1]["track_id"] = "track-a"
    uncertainty = {
        "procedure_id": "paired-track-bootstrap-v1",
        "confidence_level": 0.95,
        "resamples": 1000,
        "random_seed": 7,
    }

    with pytest.raises(ValueError, match="duplicate track_id"):
        aggregation.aggregate_complete_track_measurements(
            duplicate, uncertainty=uncertainty
        )

    unsupported = dict(uncertainty)
    unsupported["procedure_id"] = "post-hoc-bootstrap"
    with pytest.raises(ValueError, match="procedure_id"):
        aggregation.aggregate_complete_track_measurements(
            _tracks(), uncertainty=unsupported
        )

    excessive = dict(uncertainty)
    excessive["resamples"] = 1_000_001
    with pytest.raises(ValueError, match="resamples"):
        aggregation.aggregate_complete_track_measurements(
            _tracks(), uncertainty=excessive
        )
