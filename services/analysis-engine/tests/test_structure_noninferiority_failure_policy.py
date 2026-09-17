"""Regression tests for failed-track scientific acceptance policy."""

from test_structure_noninferiority_policy import _registration, _result, _validator


def test_failed_track_cannot_pass_without_preregistered_exclusion_policy() -> None:
    """A favorable aggregate cannot turn an unregistered track failure into PASS."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    result["failed_tracks"] = ["licensed-track-002"]

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert decision["failed_requirements"] == [
        "failed tracks are not permitted without a preregistered exclusion policy: "
        "licensed-track-002"
    ]
