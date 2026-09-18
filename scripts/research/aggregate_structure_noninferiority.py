#!/usr/bin/env python3
"""Aggregate complete paired structure measurements under one frozen procedure.

The sampling unit is a registered track. Baseline and candidate measurements
for that track are never separated during resampling. Quality/latency summaries
are macro track statistics so track duration does not silently become a weight.
Synthetic fixtures may exercise this module, but scientific acceptance still
requires the preregistered rights-cleared corpus.
"""

from __future__ import annotations

import importlib.util
import math
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import ModuleType
from typing import Any

import numpy as np

PROCEDURE_ID = "paired-track-bootstrap-v1"
CONFIDENCE_LEVEL = 0.95
MIN_RESAMPLES = 1000
MAX_RESAMPLES = 100_000
RNG_ALGORITHM = "numpy.random.Generator(PCG64)"
QUANTILE_METHOD = "linear"
AGGREGATION_ID = "macro-track-v1"
QUALITY_METRICS = (
    "boundary_f_0_5",
    "boundary_f_3_0",
    "functional_label_accuracy",
    "repetition_pairwise_f",
)

AGGREGATION_UNCERTAINTY_CONTRACT = {
    "aggregation_id": AGGREGATION_ID,
    "sampling_unit": "registered_track_pair",
    "quality_weighting": "equal_track",
    "latency_weighting": "equal_track",
    "boundary_and_repetition_f": "harmonic_of_macro_precision_recall",
    "report_deviation": "macro_track_mean",
    "peak_rss": "maximum_track_peak_rss",
    "procedure_id": PROCEDURE_ID,
    "confidence_level": CONFIDENCE_LEVEL,
    "bootstrap_sample_size": "registered_track_count",
    "bootstrap_replacement": True,
    "rng": RNG_ALGORITHM,
    "quantile_method": QUANTILE_METHOD,
    "two_sided_tail_probability": 0.025,
    "maximum_resamples": MAX_RESAMPLES,
}


def _validator() -> ModuleType:
    """Load the canonical evidence validator without creating a package dependency."""
    path = Path(__file__).with_name("validate_structure_noninferiority.py")
    spec = importlib.util.spec_from_file_location(
        "bandscope_structure_noninferiority_for_aggregation",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load structure noninferiority validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _mean(sides: Sequence[Mapping[str, float]], field: str) -> float:
    return math.fsum(side[field] for side in sides) / len(sides)


def _harmonic(precision: float, recall: float) -> float:
    denominator = precision + recall
    return 0.0 if denominator == 0.0 else 2.0 * precision * recall / denominator


def _aggregate_side(sides: Sequence[Mapping[str, float]]) -> dict[str, float]:
    """Compute the preregistered equal-track aggregate for one experiment side."""
    if not sides:
        raise ValueError("aggregation requires at least one measurement side")

    boundary_precision_0_5 = _mean(sides, "boundary_precision_0_5")
    boundary_recall_0_5 = _mean(sides, "boundary_recall_0_5")
    boundary_precision_3_0 = _mean(sides, "boundary_precision_3_0")
    boundary_recall_3_0 = _mean(sides, "boundary_recall_3_0")
    repetition_precision = _mean(sides, "repetition_pairwise_precision")
    repetition_recall = _mean(sides, "repetition_pairwise_recall")

    return {
        "boundary_precision_0_5": boundary_precision_0_5,
        "boundary_recall_0_5": boundary_recall_0_5,
        "boundary_f_0_5": _harmonic(
            boundary_precision_0_5,
            boundary_recall_0_5,
        ),
        "boundary_precision_3_0": boundary_precision_3_0,
        "boundary_recall_3_0": boundary_recall_3_0,
        "boundary_f_3_0": _harmonic(
            boundary_precision_3_0,
            boundary_recall_3_0,
        ),
        "reference_to_estimate_median_deviation_seconds": _mean(
            sides,
            "reference_to_estimate_median_deviation_seconds",
        ),
        "estimate_to_reference_median_deviation_seconds": _mean(
            sides,
            "estimate_to_reference_median_deviation_seconds",
        ),
        "functional_label_accuracy": _mean(sides, "functional_label_accuracy"),
        "repetition_pairwise_precision": repetition_precision,
        "repetition_pairwise_recall": repetition_recall,
        "repetition_pairwise_f": _harmonic(
            repetition_precision,
            repetition_recall,
        ),
        "p50_latency_seconds": _mean(sides, "p50_latency_seconds"),
        "p95_latency_seconds": _mean(sides, "p95_latency_seconds"),
        "peak_rss_mib": max(side["peak_rss_mib"] for side in sides),
    }


def _validate_uncertainty(uncertainty_value: object) -> tuple[int, int]:
    uncertainty = _mapping(uncertainty_value, "uncertainty")
    expected = {"procedure_id", "confidence_level", "resamples", "random_seed"}
    if set(uncertainty) != expected:
        raise ValueError("uncertainty must contain exactly the registered procedure fields")
    if uncertainty.get("procedure_id") != PROCEDURE_ID:
        raise ValueError(f"uncertainty.procedure_id must equal {PROCEDURE_ID}")
    confidence = uncertainty.get("confidence_level")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise ValueError("uncertainty.confidence_level must be numeric")
    if not math.isclose(float(confidence), CONFIDENCE_LEVEL, rel_tol=0.0, abs_tol=1e-12):
        raise ValueError("uncertainty.confidence_level must equal 0.95")
    resamples = uncertainty.get("resamples")
    if isinstance(resamples, bool) or not isinstance(resamples, int):
        raise ValueError("uncertainty.resamples must be an integer")
    if not MIN_RESAMPLES <= resamples <= MAX_RESAMPLES:
        raise ValueError(
            f"uncertainty.resamples must be in {MIN_RESAMPLES}..{MAX_RESAMPLES}"
        )
    random_seed = uncertainty.get("random_seed")
    if isinstance(random_seed, bool) or not isinstance(random_seed, int):
        raise ValueError("uncertainty.random_seed must be an integer")
    if not 0 <= random_seed <= (2**32) - 1:
        raise ValueError("uncertainty.random_seed must be in 0..4294967295")
    return resamples, random_seed


def _normalize_tracks(
    tracks_value: object,
) -> tuple[list[str], list[dict[str, float]], list[dict[str, float]]]:
    if isinstance(tracks_value, (str, bytes)) or not isinstance(tracks_value, Sequence):
        raise ValueError("tracks must be an array")
    if len(tracks_value) < 2:
        raise ValueError("aggregation requires at least two registered track pairs")

    validator = _validator()
    track_ids: list[str] = []
    baseline: list[dict[str, float]] = []
    candidate: list[dict[str, float]] = []
    for index, raw_track in enumerate(tracks_value):
        track = _mapping(raw_track, f"tracks[{index}]")
        if set(track) != {"track_id", "baseline", "candidate"}:
            raise ValueError(
                f"tracks[{index}] must contain exactly track_id, baseline, and candidate"
            )
        track_id = track.get("track_id")
        if not isinstance(track_id, str) or not track_id.strip():
            raise ValueError(f"tracks[{index}].track_id must be non-empty text")
        normalized_id = track_id.strip()
        if normalized_id in track_ids:
            raise ValueError(f"duplicate track_id: {normalized_id}")
        track_ids.append(normalized_id)
        baseline.append(
            validator._validate_measurement_side(
                track.get("baseline"),
                f"tracks[{index}].baseline",
            )
        )
        candidate.append(
            validator._validate_measurement_side(
                track.get("candidate"),
                f"tracks[{index}].candidate",
            )
        )
    return track_ids, baseline, candidate


def _quality_deltas(
    baseline: Mapping[str, float],
    candidate: Mapping[str, float],
) -> dict[str, float]:
    return {
        metric: candidate[metric] - baseline[metric]
        for metric in QUALITY_METRICS
    }


def aggregate_complete_track_measurements(
    tracks_value: object,
    *,
    uncertainty: object,
) -> dict[str, object]:
    """Return macro aggregates and deterministic paired percentile-bootstrap intervals."""
    resamples, random_seed = _validate_uncertainty(uncertainty)
    _, baseline_sides, candidate_sides = _normalize_tracks(tracks_value)
    aggregate_baseline = _aggregate_side(baseline_sides)
    aggregate_candidate = _aggregate_side(candidate_sides)
    if aggregate_baseline["p95_latency_seconds"] <= 0.0:
        raise ValueError("aggregate baseline p95 latency must be greater than zero")

    rng = np.random.Generator(np.random.PCG64(random_seed))
    sampled_deltas = {
        metric: np.empty(resamples, dtype=np.float64) for metric in QUALITY_METRICS
    }
    sampled_latency_ratio = np.empty(resamples, dtype=np.float64)
    track_count = len(baseline_sides)

    for bootstrap_index in range(resamples):
        indices = rng.integers(0, track_count, size=track_count)
        sampled_baseline = [baseline_sides[int(index)] for index in indices]
        sampled_candidate = [candidate_sides[int(index)] for index in indices]
        bootstrap_baseline = _aggregate_side(sampled_baseline)
        bootstrap_candidate = _aggregate_side(sampled_candidate)
        deltas = _quality_deltas(bootstrap_baseline, bootstrap_candidate)
        for metric in QUALITY_METRICS:
            sampled_deltas[metric][bootstrap_index] = deltas[metric]
        baseline_p95 = bootstrap_baseline["p95_latency_seconds"]
        if baseline_p95 <= 0.0:
            raise ValueError("bootstrap baseline p95 latency must be greater than zero")
        sampled_latency_ratio[bootstrap_index] = (
            bootstrap_candidate["p95_latency_seconds"] / baseline_p95
        )

    lower_probability = (1.0 - CONFIDENCE_LEVEL) / 2.0
    upper_probability = 1.0 - lower_probability

    def interval(samples: np.ndarray) -> list[float]:
        bounds = np.quantile(
            samples,
            [lower_probability, upper_probability],
            method=QUANTILE_METHOD,
        )
        return [float(bounds[0]), float(bounds[1])]

    return {
        "aggregate": {
            "baseline": aggregate_baseline,
            "candidate": aggregate_candidate,
        },
        "paired_delta_ci95": {
            metric: interval(sampled_deltas[metric]) for metric in QUALITY_METRICS
        },
        "p95_latency_ratio_ci95": interval(sampled_latency_ratio),
    }
