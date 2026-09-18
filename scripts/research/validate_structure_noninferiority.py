#!/usr/bin/env python3
"""Bind exact scientific semantics into the structure experiment identity.

The base registration schema owns corpus, experiment runtime, margins, and
result-policy fields. This façade adds repository-owned metric, aggregation, and
paired-uncertainty semantics to the canonical digest without making experiment
authors duplicate immutable implementation constants in registration JSON.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import ModuleType
from typing import Any

STRUCTURE_METRIC_CONTRACT = {
    "runtime_lock_sha256": (
        "16fd203e9c987064afc667282e001b755838ff0b484235c6932f557d2ae389f8"
    ),
    "boundary_f_0_5": {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": 0.5,
        "beta": 1.0,
        "trim": True,
    },
    "boundary_f_3_0": {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": 3.0,
        "beta": 1.0,
        "trim": True,
    },
    "boundary_deviation": {
        "implementation": "mir_eval.segment.deviation",
        "trim": True,
    },
    "repetition_pairwise_f": {
        "implementation": "mir_eval.segment.pairwise",
        "frame_size_seconds": 0.1,
        "beta": 1.0,
    },
    "aggregation_uncertainty": {
        "aggregation_id": "macro-track-v1",
        "sampling_unit": "registered_track_pair",
        "quality_weighting": "equal_track",
        "latency_weighting": "equal_track",
        "boundary_and_repetition_f": "harmonic_of_macro_precision_recall",
        "report_deviation": "macro_track_mean",
        "peak_rss": "maximum_track_peak_rss",
        "procedure_id": "paired-track-bootstrap-v1",
        "confidence_level": 0.95,
        "bootstrap_sample_size": "registered_track_count",
        "bootstrap_replacement": True,
        "rng": "numpy.random.Generator(PCG64)",
        "quantile_method": "linear",
        "two_sided_tail_probability": 0.025,
        "maximum_resamples": 100000,
    },
}


_F_COMPONENTS = {
    "boundary_f_0_5": ("boundary_precision_0_5", "boundary_recall_0_5"),
    "boundary_f_3_0": ("boundary_precision_3_0", "boundary_recall_3_0"),
    "repetition_pairwise_f": (
        "repetition_pairwise_precision",
        "repetition_pairwise_recall",
    ),
}


def _base_validator() -> ModuleType:
    """Load the unchanged base decision-policy implementation."""
    path = Path(__file__).with_name("validate_structure_noninferiority_base.py")
    spec = importlib.util.spec_from_file_location(
        "bandscope_structure_noninferiority_base",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load structure noninferiority base validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _aggregation() -> ModuleType:
    """Load the canonical macro-track/bootstrap implementation on demand."""
    path = Path(__file__).with_name("aggregate_structure_noninferiority.py")
    spec = importlib.util.spec_from_file_location(
        "bandscope_structure_noninferiority_aggregation_for_validation",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load structure noninferiority aggregation")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_BASE = _base_validator()
SCHEMA_VERSION = _BASE.SCHEMA_VERSION
MAX_EVIDENCE_BYTES = _BASE.MAX_EVIDENCE_BYTES


def validate_registration(registration_value: object) -> None:
    """Validate base policy plus the one supported paired-bootstrap procedure."""
    _BASE.validate_registration(registration_value)
    if not isinstance(registration_value, Mapping):
        raise ValueError("registration must be an object")
    uncertainty = registration_value.get("uncertainty")
    if not isinstance(uncertainty, Mapping):
        raise ValueError("uncertainty must be an object")
    contract = STRUCTURE_METRIC_CONTRACT["aggregation_uncertainty"]
    if uncertainty.get("procedure_id") != contract["procedure_id"]:
        raise ValueError(
            "uncertainty.procedure_id must equal paired-track-bootstrap-v1"
        )
    resamples = uncertainty.get("resamples")
    if isinstance(resamples, bool) or not isinstance(resamples, int):
        raise ValueError("uncertainty.resamples must be an integer")
    maximum_resamples = contract["maximum_resamples"]
    assert isinstance(maximum_resamples, int)
    if resamples > maximum_resamples:
        raise ValueError(
            f"uncertainty.resamples must be <= {maximum_resamples} for "
            "paired-track-bootstrap-v1"
        )


def _digest_payload(registration_value: object) -> dict[str, object]:
    """Return the complete closed object whose bytes define scientific identity."""
    validate_registration(registration_value)
    return {
        "registration": registration_value,
        "structure_metric_contract": STRUCTURE_METRIC_CONTRACT,
    }


def registration_digest(registration_value: object) -> str:
    """Return SHA-256 over registration data plus exact scientific semantics."""
    canonical = json.dumps(
        _digest_payload(registration_value),
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _is_legacy_interval_containment_error(error: ValueError) -> bool:
    """Return whether the base validator rejected only its old CI-centering rule."""
    message = str(error)
    return message.endswith("must contain the aggregate point delta") or message == (
        "result.p95_latency_ratio_ci95 must contain the aggregate p95 ratio"
    )


def _project_percentile_intervals_for_base(
    result_value: Mapping[str, Any],
) -> dict[str, Any]:
    """Adapt percentile intervals to the legacy base validator without changing bounds.

    Percentile-bootstrap endpoints are empirical quantiles of the bootstrap statistic
    and are not required to bracket the observed statistic. The base validator predates
    the frozen percentile procedure and imposed that extra invariant. This projection
    changes only aggregate point values in a private validation copy so the base module
    can still validate every envelope/measurement invariant and apply the *original*
    interval bounds to its noninferiority and latency decisions.
    """
    projected = copy.deepcopy(dict(result_value))
    aggregate = _BASE._mapping(projected.get("aggregate"), "result.aggregate")
    baseline = _BASE._validate_measurement_side(
        aggregate.get("baseline"),
        "result.aggregate.baseline",
    )
    candidate = _BASE._validate_measurement_side(
        aggregate.get("candidate"),
        "result.aggregate.candidate",
    )
    raw_intervals = _BASE._mapping(
        projected.get("paired_delta_ci95"),
        "result.paired_delta_ci95",
    )
    candidate_projection = dict(aggregate["candidate"])

    for metric_name in _BASE._QUALITY_METRICS:
        interval = _BASE._confidence_interval(
            raw_intervals[metric_name],
            f"result.paired_delta_ci95.{metric_name}",
        )
        baseline_value = baseline[metric_name]
        point_delta = candidate[metric_name] - baseline_value
        if interval[0] <= point_delta <= interval[1]:
            continue

        feasible_lower = max(interval[0], -baseline_value)
        feasible_upper = min(interval[1], 1.0 - baseline_value)
        if feasible_lower > feasible_upper:
            raise ValueError(
                f"result.paired_delta_ci95.{metric_name} has no feasible score delta"
            )
        projected_delta = min(max(point_delta, feasible_lower), feasible_upper)
        projected_score = baseline_value + projected_delta
        candidate_projection[metric_name] = projected_score
        for component_name in _F_COMPONENTS.get(metric_name, ()):
            candidate_projection[component_name] = projected_score

    latency_interval = _BASE._confidence_interval(
        projected.get("p95_latency_ratio_ci95"),
        "result.p95_latency_ratio_ci95",
    )
    baseline_p95 = baseline["p95_latency_seconds"]
    if baseline_p95 > 0.0:
        point_ratio = candidate["p95_latency_seconds"] / baseline_p95
        if not latency_interval[0] <= point_ratio <= latency_interval[1]:
            projected_ratio = (
                latency_interval[0]
                if point_ratio < latency_interval[0]
                else latency_interval[1]
            )
            if projected_ratio > 0.0:
                projected_p95 = baseline_p95 * projected_ratio
                candidate_projection["p95_latency_seconds"] = projected_p95
                candidate_projection["p50_latency_seconds"] = min(
                    candidate_projection["p50_latency_seconds"],
                    projected_p95,
                )

    aggregate_projection = dict(aggregate)
    aggregate_projection["candidate"] = candidate_projection
    projected["aggregate"] = aggregate_projection
    return projected


def _require_canonical_summary(
    registration_value: object,
    result_value: Mapping[str, Any],
) -> None:
    """Bind successful aggregate and CI receipts to deterministic recomputation."""
    if result_value.get("failed_tracks"):
        return

    registration = _BASE._mapping(registration_value, "registration")
    aggregation = _aggregation()
    expected = aggregation.aggregate_complete_track_measurements(
        result_value.get("tracks"),
        uncertainty=registration.get("uncertainty"),
    )
    if result_value.get("aggregate") != expected["aggregate"]:
        raise ValueError(
            "result.aggregate does not match canonical macro-track-v1 recomputation"
        )
    if result_value.get("paired_delta_ci95") != expected["paired_delta_ci95"]:
        raise ValueError(
            "result.paired_delta_ci95 does not match canonical "
            "paired-track-bootstrap-v1 recomputation"
        )
    if result_value.get("p95_latency_ratio_ci95") != expected[
        "p95_latency_ratio_ci95"
    ]:
        raise ValueError(
            "result.p95_latency_ratio_ci95 does not match canonical "
            "paired-track-bootstrap-v1 recomputation"
        )


def evaluate_result(
    registration_value: object,
    result_value: object,
) -> dict[str, object]:
    """Evaluate a receipt only when it binds the metric-aware registration digest."""
    validate_registration(registration_value)
    if not isinstance(result_value, Mapping):
        raise ValueError("result must be an object")
    expected_digest = registration_digest(registration_value)
    if result_value.get("registration_sha256") != expected_digest:
        raise ValueError(
            "result.registration_sha256 does not match the frozen metric-aware registration"
        )

    projected_result = copy.deepcopy(dict(result_value))
    projected_result["registration_sha256"] = _BASE.registration_digest(
        registration_value
    )
    try:
        decision = _BASE.evaluate_result(registration_value, projected_result)
    except ValueError as error:
        if not _is_legacy_interval_containment_error(error):
            raise
        percentile_projection = _project_percentile_intervals_for_base(
            projected_result
        )
        decision = _BASE.evaluate_result(registration_value, percentile_projection)

    _require_canonical_summary(registration_value, projected_result)
    decision["registration_sha256"] = expected_digest
    return decision


def __getattr__(name: str) -> Any:
    """Delegate unchanged schema helpers to the base policy implementation."""
    return getattr(_BASE, name)


def main(argv: Sequence[str] | None = None) -> int:
    """Validate a registration and optionally evaluate one bound result."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registration", type=Path)
    parser.add_argument("result", type=Path, nargs="?")
    args = parser.parse_args(argv)

    registration = _BASE._load_json(args.registration)
    digest = registration_digest(registration)
    if args.result is None:
        print(json.dumps({"registration_sha256": digest}, sort_keys=True))
        return 0

    result = _BASE._load_json(args.result)
    decision = evaluate_result(registration, result)
    print(json.dumps(decision, sort_keys=True))
    return 0 if decision["passed"] is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
