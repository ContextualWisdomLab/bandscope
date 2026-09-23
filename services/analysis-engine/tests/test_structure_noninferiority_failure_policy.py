"""Regression tests for failed-track scientific acceptance policy."""

import pytest
from test_structure_noninferiority_policy import _registration, _result, _validator


def _remove_failed_measurements(result: dict[str, object]) -> None:
    """Model a real track whose MIR measurement could not be produced."""
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    failed_track = tracks[1]
    assert isinstance(failed_track, dict)
    del failed_track["baseline"]
    del failed_track["candidate"]


def _remove_post_failure_summaries(result: dict[str, object]) -> None:
    """Avoid inventing complete-case aggregates after a registered track fails."""
    result["aggregate"] = None
    result["paired_delta_ci95"] = None
    result["p95_latency_ratio_ci95"] = None


def test_failed_track_cannot_pass_without_preregistered_exclusion_policy() -> None:
    """A failed track remains diagnostic evidence and cannot PASS."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    result["failed_tracks"] = ["licensed-track-002"]
    _remove_failed_measurements(result)
    _remove_post_failure_summaries(result)

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert decision["failed_tracks"] == ["licensed-track-002"]
    assert decision["failed_requirements"] == [
        "failed tracks are not permitted without a preregistered exclusion policy: "
        "licensed-track-002"
    ]


def test_failed_track_cannot_publish_complete_case_summary() -> None:
    """A failed run cannot attach aggregates computed from only surviving tracks."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    result["failed_tracks"] = ["licensed-track-002"]
    _remove_failed_measurements(result)

    with pytest.raises(
        ValueError,
        match="result.aggregate must be null when result.failed_tracks is non-empty",
    ):
        validator.evaluate_result(registration, result)


def test_missing_measurements_require_explicit_failed_track() -> None:
    """Omitted metrics must fail closed unless the same track is declared failed."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    _remove_failed_measurements(result)

    with pytest.raises(ValueError, match="baseline"):
        validator.evaluate_result(registration, result)


def test_failed_track_cannot_carry_fabricated_measurements() -> None:
    """A failed receipt must not retain values that imply successful measurement."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    result["failed_tracks"] = ["licensed-track-002"]

    with pytest.raises(ValueError, match="unregistered field: baseline"):
        validator.evaluate_result(registration, result)
