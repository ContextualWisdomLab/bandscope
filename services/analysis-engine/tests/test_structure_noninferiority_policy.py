"""Tests for preregistered structure-feature noninferiority evidence."""

from __future__ import annotations

import copy
import math
from types import ModuleType

import pytest
from conftest import load_module


def _validator() -> ModuleType:
    """Load the repository-owned structure experiment validator."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority",
    )


def _registration() -> dict[str, object]:
    """Return a valid synthetic registration fixture for policy tests only."""
    return {
        "schema_version": 1,
        "experiment_id": "structure-chroma-stft-vs-cqt-v1",
        "hypothesis": {
            "baseline_feature": "chroma_cqt",
            "candidate_feature": "chroma_stft",
        },
        "metrics": {
            "boundary_f_0_5": {
                "implementation": "mir_eval.segment.detection",
                "window_seconds": 0.5,
                "noninferiority_margin": 0.02,
            },
            "boundary_f_3_0": {
                "implementation": "mir_eval.segment.detection",
                "window_seconds": 3.0,
                "noninferiority_margin": 0.02,
            },
            "functional_label_accuracy": {
                "implementation": "mirex2025.frame_level_accuracy",
                "noninferiority_margin": 0.02,
            },
            "repetition_pairwise_f": {
                "implementation": "mir_eval.segment.pairwise",
                "frame_size_seconds": 0.1,
                "noninferiority_margin": 0.02,
            },
            "p95_latency_ratio": {
                "maximum_candidate_ratio": 0.8,
            },
        },
        "uncertainty": {
            "procedure_id": "paired-track-bootstrap-v1",
            "confidence_level": 0.95,
            "resamples": 10000,
            "random_seed": 20260917,
        },
        "corpus": [
            {
                "track_id": "licensed-track-001",
                "audio_sha256": "a" * 64,
                "annotation_sha256": "b" * 64,
                "rights_basis": "evaluation-and-redistribution grant 2026-09-01",
                "rights_cleared": True,
                "source_uri": "https://example.invalid/licensed-track-001",
            },
            {
                "track_id": "licensed-track-002",
                "audio_sha256": "c" * 64,
                "annotation_sha256": "d" * 64,
                "rights_basis": "private evaluation license 2026-09-01",
                "rights_cleared": True,
                "source_uri": "urn:bandscope:private-benchmark:licensed-track-002",
            },
        ],
        "runtime": {
            "source_commit": "e" * 40,
            "uv_lock_sha256": "f" * 64,
            "python_version": "3.12.11",
            "librosa_version": "0.11.0",
            "numpy_version": "2.3.3",
            "sample_rate_hz": 44100,
            "channels": 1,
            "host_profile": "registered-cpu-host-v1",
        },
    }


def _measurement(
    *,
    boundary_f_0_5: float,
    boundary_f_3_0: float,
    functional_label_accuracy: float,
    repetition_pairwise_f: float,
    p50_latency_seconds: float,
    p95_latency_seconds: float,
    peak_rss_mib: float,
) -> dict[str, float]:
    """Return one complete track/aggregate measurement record."""
    return {
        "boundary_precision_0_5": boundary_f_0_5,
        "boundary_recall_0_5": boundary_f_0_5,
        "boundary_f_0_5": boundary_f_0_5,
        "boundary_precision_3_0": boundary_f_3_0,
        "boundary_recall_3_0": boundary_f_3_0,
        "boundary_f_3_0": boundary_f_3_0,
        "reference_to_estimate_median_deviation_seconds": 0.18,
        "estimate_to_reference_median_deviation_seconds": 0.21,
        "functional_label_accuracy": functional_label_accuracy,
        "repetition_pairwise_precision": repetition_pairwise_f,
        "repetition_pairwise_recall": repetition_pairwise_f,
        "repetition_pairwise_f": repetition_pairwise_f,
        "p50_latency_seconds": p50_latency_seconds,
        "p95_latency_seconds": p95_latency_seconds,
        "peak_rss_mib": peak_rss_mib,
    }


def _uncertainty(registration: dict[str, object]) -> dict[str, object]:
    """Return the typed uncertainty plan from a registration."""
    value = registration["uncertainty"]
    assert isinstance(value, dict)
    return value


def _result(registration: dict[str, object], registration_sha256: str) -> dict[str, object]:
    """Return a result fixture whose paired intervals satisfy the registration."""
    baseline = _measurement(
        boundary_f_0_5=0.70,
        boundary_f_3_0=0.78,
        functional_label_accuracy=0.72,
        repetition_pairwise_f=0.74,
        p50_latency_seconds=4.0,
        p95_latency_seconds=6.0,
        peak_rss_mib=650.0,
    )
    candidate = _measurement(
        boundary_f_0_5=0.695,
        boundary_f_3_0=0.775,
        functional_label_accuracy=0.715,
        repetition_pairwise_f=0.738,
        p50_latency_seconds=1.8,
        p95_latency_seconds=4.2,
        peak_rss_mib=590.0,
    )
    return {
        "schema_version": 1,
        "experiment_id": "structure-chroma-stft-vs-cqt-v1",
        "registration_sha256": registration_sha256,
        "uncertainty": copy.deepcopy(_uncertainty(registration)),
        "corpus_track_ids": ["licensed-track-001", "licensed-track-002"],
        "tracks": [
            {
                "track_id": "licensed-track-001",
                "baseline": copy.deepcopy(baseline),
                "candidate": copy.deepcopy(candidate),
            },
            {
                "track_id": "licensed-track-002",
                "baseline": copy.deepcopy(baseline),
                "candidate": copy.deepcopy(candidate),
            },
        ],
        "aggregate": {
            "baseline": baseline,
            "candidate": candidate,
        },
        "paired_delta_ci95": {
            "boundary_f_0_5": [-0.015, 0.005],
            "boundary_f_3_0": [-0.014, 0.004],
            "functional_label_accuracy": [-0.018, 0.003],
            "repetition_pairwise_f": [-0.012, 0.006],
        },
        "p95_latency_ratio_ci95": [0.66, 0.76],
        "failed_tracks": [],
        "claim_boundary": (
            "Applies only to the registered rights-cleared corpus and exact runtime identity."
        ),
    }


def _corpus(registration: dict[str, object]) -> list[dict[str, object]]:
    """Return the typed corpus fixture from a registration."""
    value = registration["corpus"]
    assert isinstance(value, list)
    assert all(isinstance(track, dict) for track in value)
    return value  # type: ignore[return-value]


def _metrics(registration: dict[str, object]) -> dict[str, object]:
    """Return the typed metric registry from a registration."""
    value = registration["metrics"]
    assert isinstance(value, dict)
    return value


def test_registration_digest_is_canonical_and_accepts_required_evidence() -> None:
    """Equivalent key order must not change the frozen preregistration identity."""
    validator = _validator()
    registration = _registration()

    validator.validate_registration(registration)
    digest = validator.registration_digest(registration)
    reordered = dict(reversed(list(registration.items())))

    assert len(digest) == 64
    assert digest == validator.registration_digest(reordered)


def test_registration_rejects_unverifiable_real_audio() -> None:
    """Rights, content identity, and unique track identity are mandatory evidence."""
    validator = _validator()

    no_rights = _registration()
    _corpus(no_rights)[0]["rights_cleared"] = False
    with pytest.raises(ValueError, match="rights_cleared"):
        validator.validate_registration(no_rights)

    bad_hash = _registration()
    _corpus(bad_hash)[0]["audio_sha256"] = "abcd"
    with pytest.raises(ValueError, match="audio_sha256"):
        validator.validate_registration(bad_hash)

    duplicate = _registration()
    _corpus(duplicate).append(copy.deepcopy(_corpus(duplicate)[0]))
    with pytest.raises(ValueError, match="duplicate track_id"):
        validator.validate_registration(duplicate)


def test_registration_rejects_incomplete_or_post_hoc_decision_contract() -> None:
    """Metrics, margins, and uncertainty procedure must be frozen before results."""
    validator = _validator()
    registration = _registration()
    del _metrics(registration)["boundary_f_3_0"]

    with pytest.raises(ValueError, match="boundary_f_3_0"):
        validator.validate_registration(registration)

    registration = _registration()
    latency = _metrics(registration)["p95_latency_ratio"]
    assert isinstance(latency, dict)
    latency["maximum_candidate_ratio"] = 1.0
    with pytest.raises(ValueError, match="maximum_candidate_ratio"):
        validator.validate_registration(registration)

    registration = _registration()
    del _uncertainty(registration)["random_seed"]
    with pytest.raises(ValueError, match="random_seed"):
        validator.validate_registration(registration)

    registration = _registration()
    _uncertainty(registration)["confidence_level"] = 0.90
    with pytest.raises(ValueError, match="confidence_level"):
        validator.validate_registration(registration)


def test_result_passes_only_when_paired_uncertainty_meets_frozen_contract() -> None:
    """Decision uses paired CI bounds rather than aggregate point estimates alone."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)

    decision = validator.evaluate_result(registration, _result(registration, digest))

    assert decision["passed"] is True
    assert decision["failed_requirements"] == []


def test_result_fails_quality_or_latency_when_ci_crosses_registered_boundary() -> None:
    """A favorable point estimate cannot hide a noninferiority or latency CI miss."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(registration, digest)
    deltas = result["paired_delta_ci95"]
    assert isinstance(deltas, dict)
    deltas["boundary_f_0_5"] = [-0.021, 0.004]
    result["p95_latency_ratio_ci95"] = [0.70, 0.81]

    decision = validator.evaluate_result(registration, result)

    assert decision["passed"] is False
    assert decision["failed_requirements"] == [
        "boundary_f_0_5 paired CI lower bound -0.021000 is below -0.020000",
        "p95 latency ratio CI upper bound 0.810000 exceeds 0.800000",
    ]


def test_result_requires_track_level_metrics_and_boundary_deviations() -> None:
    """Aggregate success cannot replace per-track recognized structure evidence."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)

    missing_track_metric = _result(registration, digest)
    tracks = missing_track_metric["tracks"]
    assert isinstance(tracks, list)
    first_track = tracks[0]
    assert isinstance(first_track, dict)
    baseline = first_track["baseline"]
    assert isinstance(baseline, dict)
    del baseline["reference_to_estimate_median_deviation_seconds"]
    with pytest.raises(ValueError, match="reference_to_estimate_median_deviation_seconds"):
        validator.evaluate_result(registration, missing_track_metric)

    missing_aggregate_metric = _result(registration, digest)
    aggregate = missing_aggregate_metric["aggregate"]
    assert isinstance(aggregate, dict)
    candidate = aggregate["candidate"]
    assert isinstance(candidate, dict)
    del candidate["estimate_to_reference_median_deviation_seconds"]
    with pytest.raises(ValueError, match="estimate_to_reference_median_deviation_seconds"):
        validator.evaluate_result(registration, missing_aggregate_metric)


def test_result_rejects_inconsistent_precision_recall_f_triplets() -> None:
    """Receipt F values must agree with recognized metric precision and recall."""
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
    candidate["boundary_f_0_5"] = 0.9

    with pytest.raises(ValueError, match="boundary_f_0_5 must equal the harmonic mean"):
        validator.evaluate_result(registration, result)


def test_result_is_bound_to_registration_corpus_and_finite_measurements() -> None:
    """Results cannot drift registration, corpus, uncertainty, or numeric validity."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)

    wrong_digest = _result(registration, "0" * 64)
    with pytest.raises(ValueError, match="registration_sha256"):
        validator.evaluate_result(registration, wrong_digest)

    wrong_corpus = _result(registration, digest)
    wrong_corpus["corpus_track_ids"] = ["licensed-track-001"]
    with pytest.raises(ValueError, match="corpus_track_ids"):
        validator.evaluate_result(registration, wrong_corpus)

    wrong_uncertainty = _result(registration, digest)
    uncertainty = wrong_uncertainty["uncertainty"]
    assert isinstance(uncertainty, dict)
    uncertainty["random_seed"] = 1
    with pytest.raises(ValueError, match="uncertainty"):
        validator.evaluate_result(registration, wrong_uncertainty)

    nonfinite = _result(registration, digest)
    aggregate = nonfinite["aggregate"]
    assert isinstance(aggregate, dict)
    candidate = aggregate["candidate"]
    assert isinstance(candidate, dict)
    candidate["p95_latency_seconds"] = math.inf
    with pytest.raises(ValueError, match="finite"):
        validator.evaluate_result(registration, nonfinite)
