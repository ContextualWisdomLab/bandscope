"""Regression tests for exact structure metric preregistration semantics."""

from __future__ import annotations

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
}


def _validator() -> ModuleType:
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_metric_contract",
    )


def _canonical_digest(value: object) -> str:
    payload = json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def test_registration_digest_binds_exact_metric_runtime_and_adapter_semantics() -> None:
    """Scientific identity includes every reviewed mir_eval argument and lock digest."""
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


def test_result_rejects_receipt_bound_only_to_the_legacy_registration_digest() -> None:
    """A receipt cannot omit the metric contract by hashing registration JSON alone."""
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
