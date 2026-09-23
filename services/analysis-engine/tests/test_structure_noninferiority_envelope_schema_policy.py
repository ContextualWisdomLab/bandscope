"""Regression tests for closed-world structure evidence envelopes."""

from __future__ import annotations

import pytest
from test_structure_noninferiority_policy import (
    _corpus,
    _metrics,
    _registration,
    _result,
    _validator,
)


def test_registration_rejects_unregistered_top_level_field() -> None:
    """Registration cannot silently widen the preregistered evidence contract."""
    validator = _validator()
    registration = _registration()
    registration["post_hoc_analysis_plan"] = "not part of schema v1"

    with pytest.raises(ValueError, match="registration contains unregistered field"):
        validator.validate_registration(registration)


def test_registration_rejects_unregistered_nested_contract_fields() -> None:
    """Hypothesis, metric, corpus, and runtime objects are closed schema objects."""
    validator = _validator()

    hypothesis_drift = _registration()
    hypothesis = hypothesis_drift["hypothesis"]
    assert isinstance(hypothesis, dict)
    hypothesis["pilot_selected"] = True
    with pytest.raises(ValueError, match="hypothesis contains unregistered field"):
        validator.validate_registration(hypothesis_drift)

    metric_drift = _registration()
    metric = _metrics(metric_drift)["boundary_f_0_5"]
    assert isinstance(metric, dict)
    metric["post_hoc_weight"] = 2.0
    with pytest.raises(ValueError, match="metrics.boundary_f_0_5 contains unregistered field"):
        validator.validate_registration(metric_drift)

    corpus_drift = _registration()
    _corpus(corpus_drift)[0]["selected_for_primary_analysis"] = True
    with pytest.raises(ValueError, match="corpus\[0\] contains unregistered field"):
        validator.validate_registration(corpus_drift)

    runtime_drift = _registration()
    runtime = runtime_drift["runtime"]
    assert isinstance(runtime, dict)
    runtime["cache_state"] = "warm"
    with pytest.raises(ValueError, match="runtime contains unregistered field"):
        validator.validate_registration(runtime_drift)


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


def test_aggregate_receipt_rejects_unregistered_control_field() -> None:
    """Aggregate control metadata cannot bypass the closed result schema."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    aggregate = result["aggregate"]
    assert isinstance(aggregate, dict)
    aggregate["selected_tracks"] = ["licensed-track-001"]

    with pytest.raises(ValueError, match="result.aggregate contains unregistered field"):
        validator.evaluate_result(registration, result)


def test_result_claim_boundary_cannot_expand_beyond_preregistration() -> None:
    """Post-result prose cannot widen the scientific claim after evidence is visible."""
    validator = _validator()
    registration = _registration()
    registration["claim_boundary"] = (
        "Applies only to the registered rights-cleared corpus and exact runtime identity."
    )
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    result["claim_boundary"] = "Applies to all music, codecs, machines, and genres."

    with pytest.raises(
        ValueError,
        match="result.claim_boundary must exactly match the preregistered claim boundary",
    ):
        validator.evaluate_result(registration, result)


def test_result_experiment_id_matches_normalized_preregistration_identity() -> None:
    """Whitespace in a valid registration ID must not make its result impossible."""
    validator = _validator()
    registration = _registration()
    registration["experiment_id"] = "  structure-chroma-stft-vs-cqt-v1  "
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is True
    assert decision["registration_sha256"] == digest
