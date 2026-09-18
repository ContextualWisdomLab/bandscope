"""Regressions binding structure decision receipts to canonical aggregation output."""

from __future__ import annotations

from types import ModuleType

import pytest
from conftest import load_module
from test_structure_noninferiority_policy import _registration, _result


def _validator() -> ModuleType:
    """Load the metric-aware noninferiority validator under a unique module name."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_receipt_binding",
    )


def test_result_rejects_aggregate_not_recomputed_from_registered_track_receipts() -> None:
    """Track evidence cannot disagree with a favorable stored aggregate."""
    validator = _validator()
    registration = _registration()
    result = _result(registration, validator.registration_digest(registration))
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    first_track = tracks[0]
    assert isinstance(first_track, dict)
    candidate = first_track["candidate"]
    assert isinstance(candidate, dict)
    candidate["functional_label_accuracy"] = 0.10

    with pytest.raises(ValueError, match="canonical macro-track-v1 recomputation"):
        validator.evaluate_result(registration, result)


def test_result_rejects_ci_not_recomputed_from_registered_track_receipts() -> None:
    """A favorable hand-edited CI cannot become scientific decision evidence."""
    validator = _validator()
    registration = _registration()
    result = _result(registration, validator.registration_digest(registration))
    intervals = result["paired_delta_ci95"]
    assert isinstance(intervals, dict)
    intervals["boundary_f_0_5"] = [-0.010, 0.000]

    with pytest.raises(ValueError, match="canonical paired-track-bootstrap-v1 recomputation"):
        validator.evaluate_result(registration, result)
