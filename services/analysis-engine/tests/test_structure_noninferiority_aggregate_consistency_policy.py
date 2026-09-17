"""Regression tests for aggregate-to-track structure evidence consistency."""

from __future__ import annotations

import pytest

from test_structure_noninferiority_policy import _registration, _result, _validator


def _track_candidate(result: dict[str, object], index: int) -> dict[str, object]:
    """Return one candidate measurement object from a synthetic result fixture."""
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    track = tracks[index]
    assert isinstance(track, dict)
    candidate = track["candidate"]
    assert isinstance(candidate, dict)
    return candidate


def test_result_rejects_aggregate_quality_outside_track_evidence_range() -> None:
    """Aggregate quality cannot claim a value no admitted track can support."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)

    for index in range(2):
        candidate = _track_candidate(result, index)
        candidate["boundary_precision_0_5"] = 0.50
        candidate["boundary_recall_0_5"] = 0.50
        candidate["boundary_f_0_5"] = 0.50

    with pytest.raises(ValueError, match="aggregate candidate boundary_f_0_5"):
        validator.evaluate_result(registration, result)


def test_result_rejects_aggregate_latency_ratio_outside_track_evidence_range() -> None:
    """Aggregate speedup cannot contradict every admitted paired track ratio."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)

    for index in range(2):
        candidate = _track_candidate(result, index)
        candidate["p50_latency_seconds"] = 7.0
        candidate["p95_latency_seconds"] = 9.0

    with pytest.raises(ValueError, match="aggregate p95 latency ratio"):
        validator.evaluate_result(registration, result)
