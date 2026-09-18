"""Regression tests for percentile-bootstrap result admission semantics."""

from __future__ import annotations

from types import ModuleType

from conftest import load_module
from test_structure_noninferiority_policy import _registration, _result


def _validator() -> ModuleType:
    """Load the metric-aware noninferiority validator under a unique module name."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_percentile_admission",
    )


def test_asymmetric_quality_interval_still_fails_registered_noninferiority_margin() -> None:
    """Removing point containment must not weaken the CI lower-bound decision."""
    validator = _validator()
    registration = _registration()
    result = _result(registration, validator.registration_digest(registration))
    intervals = result["paired_delta_ci95"]
    assert isinstance(intervals, dict)
    intervals["boundary_f_0_5"] = [-0.030, -0.025]

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert any(
        "boundary_f_0_5 paired CI lower bound" in requirement
        for requirement in decision["failed_requirements"]
    )


def test_asymmetric_latency_interval_still_fails_registered_ratio_threshold() -> None:
    """The compatibility projection must preserve the original CI upper bound."""
    validator = _validator()
    registration = _registration()
    result = _result(registration, validator.registration_digest(registration))
    result["p95_latency_ratio_ci95"] = [0.81, 0.85]

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert any(
        "p95 latency ratio CI upper bound" in requirement
        for requirement in decision["failed_requirements"]
    )
