"""Regression tests for exact structure metric preregistration semantics."""

from __future__ import annotations

import copy
from types import ModuleType

import pytest
from conftest import load_module

from test_structure_noninferiority_policy import _metrics, _registration

_METRIC_LOCK_SHA256 = "16fd203e9c987064afc667282e001b755838ff0b484235c6932f557d2ae389f8"


def _metric_validator() -> ModuleType:
    return load_module(
        "scripts/research/validate_structure_metric_preregistration.py",
        "validate_structure_metric_preregistration",
    )


def _exact_registration() -> dict[str, object]:
    """Return the intended closed metric-runtime and adapter contract."""
    registration = _registration()
    registration["metric_runtime"] = {"lock_sha256": _METRIC_LOCK_SHA256}
    registration["report_metrics"] = {
        "boundary_deviation": {
            "implementation": "mir_eval.segment.deviation",
            "trim": True,
        }
    }
    metrics = _metrics(registration)
    boundary_05 = metrics["boundary_f_0_5"]
    boundary_30 = metrics["boundary_f_3_0"]
    pairwise = metrics["repetition_pairwise_f"]
    assert isinstance(boundary_05, dict)
    assert isinstance(boundary_30, dict)
    assert isinstance(pairwise, dict)
    boundary_05.update({"beta": 1.0, "trim": True})
    boundary_30.update({"beta": 1.0, "trim": True})
    pairwise["beta"] = 1.0
    return registration


def test_registration_accepts_only_exact_metric_runtime_and_adapter_semantics() -> None:
    """The digest must bind the exact lock and every result-affecting adapter argument."""
    validator = _metric_validator()
    registration = _exact_registration()

    validator.validate_registration(registration)
    expected_digest = validator.registration_digest(registration)

    drifts: list[tuple[str, object]] = [
        ("metric_runtime", {"lock_sha256": "0" * 64}),
        (
            "report_metrics",
            {
                "boundary_deviation": {
                    "implementation": "mir_eval.segment.deviation",
                    "trim": False,
                }
            },
        ),
    ]
    for field, replacement in drifts:
        drifted = copy.deepcopy(registration)
        drifted[field] = replacement
        with pytest.raises(ValueError):
            validator.validate_registration(drifted)

    for metric_name, field, replacement in (
        ("boundary_f_0_5", "beta", 0.5),
        ("boundary_f_0_5", "trim", False),
        ("boundary_f_3_0", "beta", 2.0),
        ("boundary_f_3_0", "trim", False),
        ("repetition_pairwise_f", "beta", 0.5),
    ):
        drifted = copy.deepcopy(registration)
        metrics = _metrics(drifted)
        config = metrics[metric_name]
        assert isinstance(config, dict)
        config[field] = replacement
        with pytest.raises(ValueError, match=field):
            validator.validate_registration(drifted)

    reordered = dict(reversed(list(registration.items())))
    assert validator.registration_digest(reordered) == expected_digest
