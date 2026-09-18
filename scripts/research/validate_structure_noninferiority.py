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
    decision = _BASE.evaluate_result(registration_value, projected_result)
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
