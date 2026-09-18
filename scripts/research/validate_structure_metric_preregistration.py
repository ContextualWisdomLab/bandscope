#!/usr/bin/env python3
"""Bind exact structure-metric semantics into the scientific registration digest.

The base registration schema owns corpus, experiment runtime, margins, and
paired-decision fields. This façade adds the repository-owned metric contract to
the canonical digest without making callers repeat immutable adapter constants
inside every registration JSON. No MIR metric or corpus outcome is computed
here.
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
    """Validate the closed base registration consumed by the metric-aware digest."""
    _BASE.validate_registration(registration_value)


def _digest_payload(registration_value: object) -> dict[str, object]:
    """Return the complete closed object whose bytes define scientific identity."""
    validate_registration(registration_value)
    return {
        "registration": registration_value,
        "structure_metric_contract": STRUCTURE_METRIC_CONTRACT,
    }


def registration_digest(registration_value: object) -> str:
    """Return SHA-256 over registration data plus exact metric/runtime semantics."""
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
