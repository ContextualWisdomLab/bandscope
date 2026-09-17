"""Regression tests for closed-world structure experiment result receipts."""

from __future__ import annotations

import pytest

from test_structure_noninferiority_policy import _registration, _result, _validator


def test_track_measurement_rejects_unregistered_post_hoc_field() -> None:
    """Per-track evidence cannot grow new result fields after preregistration."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    first_track = tracks[0]
    assert isinstance(first_track, dict)
    candidate = first_track["candidate"]
    assert isinstance(candidate, dict)
    candidate["post_hoc_quality_score"] = 0.99

    with pytest.raises(ValueError, match="contains unregistered field: post_hoc_quality_score"):
        validator.evaluate_result(registration, result)


def test_aggregate_measurement_rejects_unregistered_post_hoc_field() -> None:
    """Aggregate evidence uses the same closed metric receipt as each track."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    aggregate = result["aggregate"]
    assert isinstance(aggregate, dict)
    baseline = aggregate["baseline"]
    assert isinstance(baseline, dict)
    baseline["post_hoc_quality_score"] = 0.99

    with pytest.raises(ValueError, match="contains unregistered field: post_hoc_quality_score"):
        validator.evaluate_result(registration, result)
