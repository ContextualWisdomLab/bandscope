"""Regression tests for exact structure scientific preregistration semantics."""

from __future__ import annotations

import copy
import hashlib
import json
from types import ModuleType

import pytest
from conftest import load_module
from test_structure_noninferiority_policy import _registration, _result

_EXPECTED_METRIC_CONTRACT = {
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
    "performance_measurement": {
        "contract_id": "isolated-single-shot-v1",
        "supported_platforms": ["darwin", "win32"],
        "warmup_trials": 0,
        "measured_trials": 20,
        "trial_process": "fresh_subprocess_per_lane_trial",
        "lane_order": "alternate_baseline_candidate_by_trial_index",
        "timer": "time.perf_counter_ns",
        "timer_scope": "repository_structure_segmenter_only",
        "worker_startup_in_latency": False,
        "input_transfer_in_latency": False,
        "latency_quantiles": [0.5, 0.95],
        "quantile_method": "linear",
        "memory_metric": "process_peak_resident_set_size",
        "memory_scope": "entire_worker_process_lifetime_including_pcm_input",
        "peak_rss_aggregation": "maximum_across_trials",
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


def _validator() -> ModuleType:
    """Load the metric-aware structure registration validator."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_metric_contract",
    )


def _canonical_digest(value: object) -> str:
    """Return the canonical compact JSON SHA-256 used by the registration owner."""
    payload = json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def test_registration_digest_binds_exact_scientific_semantics() -> None:
    """Scientific identity includes metrics, performance, and aggregation procedure."""
    validator = _validator()
    registration = _registration()

    validator.validate_registration(registration)
    expected = _canonical_digest(
        {
            "registration": registration,
            "structure_metric_contract": _EXPECTED_METRIC_CONTRACT,
        }
    )

    assert validator.STRUCTURE_METRIC_CONTRACT == _EXPECTED_METRIC_CONTRACT
    assert validator.registration_digest(registration) == expected
    assert validator.registration_digest(dict(reversed(list(registration.items())))) == expected


def test_digest_contract_matches_executable_metric_and_aggregation_owners() -> None:
    """Digest metadata cannot drift from metric, performance, or aggregation owners."""
    validator = _validator()
    adapter = load_module(
        "scripts/research/evaluate_structure_segmentation_metrics.py",
        "structure_segmentation_metric_owner_for_registration",
    )
    runtime = load_module(
        "scripts/research/verify_structure_metric_runtime_lock.py",
        "structure_metric_runtime_owner_for_registration",
    )
    measurement = load_module(
        "scripts/research/measure_structure_lane_resources.py",
        "structure_performance_owner_for_registration",
    )
    aggregation = load_module(
        "scripts/research/aggregate_structure_noninferiority.py",
        "structure_aggregation_owner_for_registration",
    )
    contract = validator.STRUCTURE_METRIC_CONTRACT

    assert contract["runtime_lock_sha256"] == hashlib.sha256(
        runtime.EXPECTED_LOCK_TEXT.encode("utf-8")
    ).hexdigest()
    assert contract["boundary_f_0_5"] == {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": adapter.BOUNDARY_WINDOWS_SECONDS[0],
        "beta": adapter.BOUNDARY_BETA,
        "trim": adapter.BOUNDARY_TRIM,
    }
    assert contract["boundary_f_3_0"] == {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": adapter.BOUNDARY_WINDOWS_SECONDS[1],
        "beta": adapter.BOUNDARY_BETA,
        "trim": adapter.BOUNDARY_TRIM,
    }
    assert contract["boundary_deviation"] == {
        "implementation": "mir_eval.segment.deviation",
        "trim": adapter.BOUNDARY_TRIM,
    }
    assert contract["repetition_pairwise_f"] == {
        "implementation": "mir_eval.segment.pairwise",
        "frame_size_seconds": adapter.PAIRWISE_FRAME_SIZE_SECONDS,
        "beta": adapter.PAIRWISE_BETA,
    }
    assert contract["performance_measurement"] == (
        measurement.PERFORMANCE_MEASUREMENT_CONTRACT
    )
    assert contract["aggregation_uncertainty"] == (
        aggregation.AGGREGATION_UNCERTAINTY_CONTRACT
    )


def test_registration_rejects_unsupported_uncertainty_implementation() -> None:
    """A free-form procedure label cannot bypass the one executable bootstrap owner."""
    validator = _validator()
    unsupported = _registration()
    uncertainty = unsupported["uncertainty"]
    assert isinstance(uncertainty, dict)
    uncertainty["procedure_id"] = "post-hoc-bootstrap"

    with pytest.raises(ValueError, match="procedure_id"):
        validator.validate_registration(unsupported)

    excessive = copy.deepcopy(_registration())
    excessive_uncertainty = excessive["uncertainty"]
    assert isinstance(excessive_uncertainty, dict)
    excessive_uncertainty["resamples"] = 100001
    with pytest.raises(ValueError, match="resamples"):
        validator.validate_registration(excessive)


def test_result_rejects_receipt_bound_only_to_the_legacy_registration_digest() -> None:
    """A receipt cannot omit the scientific contract by hashing registration JSON alone."""
    validator = _validator()
    registration = _registration()
    metric_aware_digest = validator.registration_digest(registration)
    legacy_digest = _canonical_digest(registration)

    with pytest.raises(ValueError, match="metric-aware registration"):
        validator.evaluate_result(registration, _result(registration, legacy_digest))

    decision = validator.evaluate_result(
        registration,
        _result(registration, metric_aware_digest),
    )
    assert decision["passed"] is True
    assert decision["registration_sha256"] == metric_aware_digest
