"""Regression tests for percentile-bootstrap result admission semantics."""

from __future__ import annotations

from types import ModuleType

from conftest import load_module
from test_structure_noninferiority_policy import (
    _refresh_canonical_summary,
    _registration,
    _result,
)


def _validator() -> ModuleType:
    """Load the metric-aware noninferiority validator under a unique module name."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_percentile_admission",
    )


def test_canonical_quality_interval_still_fails_registered_noninferiority_margin() -> None:
    """Receipt binding must preserve the preregistered CI lower-bound decision."""
    validator = _validator()
    registration = _registration()
    result = _result(registration, validator.registration_digest(registration))
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    for track in tracks:
        assert isinstance(track, dict)
        candidate = track["candidate"]
        assert isinstance(candidate, dict)
        candidate["boundary_precision_0_5"] = 0.67
        candidate["boundary_recall_0_5"] = 0.67
        candidate["boundary_f_0_5"] = 0.67
    _refresh_canonical_summary(registration, result)

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert any(
        "boundary_f_0_5 paired CI lower bound" in requirement
        for requirement in decision["failed_requirements"]
    )


def test_canonical_latency_interval_still_fails_registered_ratio_threshold() -> None:
    """Receipt binding must preserve the preregistered latency upper-bound decision."""
    validator = _validator()
    registration = _registration()
    result = _result(registration, validator.registration_digest(registration))
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    for track in tracks:
        assert isinstance(track, dict)
        candidate = track["candidate"]
        assert isinstance(candidate, dict)
        candidate["p95_latency_seconds"] = 5.1
    _refresh_canonical_summary(registration, result)

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert any(
        "p95 latency ratio CI upper bound" in requirement
        for requirement in decision["failed_requirements"]
    )
