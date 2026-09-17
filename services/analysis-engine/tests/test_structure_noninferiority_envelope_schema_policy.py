"""Regression tests for closed-world structure evidence envelopes."""

from __future__ import annotations

import pytest

from test_structure_noninferiority_policy import _registration, _result, _validator


def test_registration_rejects_unregistered_top_level_field() -> None:
    """Registration cannot silently widen the preregistered evidence contract."""
    validator = _validator()
    registration = _registration()
    registration["post_hoc_analysis_plan"] = "not part of schema v1"

    with pytest.raises(ValueError, match="registration contains unregistered field"):
        validator.validate_registration(registration)


def test_result_rejects_unregistered_top_level_field() -> None:
    """Post-result claims outside schema v1 must not enter admitted evidence."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    result["post_hoc_p_value"] = 0.001

    with pytest.raises(ValueError, match="result contains unregistered field"):
        validator.evaluate_result(registration, result)


def test_track_receipt_rejects_unregistered_control_field() -> None:
    """A track cannot carry a post-hoc selection flag beside its measurements."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    tracks = result["tracks"]
    assert isinstance(tracks, list)
    first_track = tracks[0]
    assert isinstance(first_track, dict)
    first_track["selected_for_aggregate"] = True

    with pytest.raises(ValueError, match="result.tracks\[0\] contains unregistered field"):
        validator.evaluate_result(registration, result)
