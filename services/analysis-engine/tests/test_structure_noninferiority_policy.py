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


def _result(registration_sha256: str) -> dict[str, object]:
    """Return a result fixture whose paired intervals satisfy the registration."""
    return {
        "schema_version": 1,
        "experiment_id": "structure-chroma-stft-vs-cqt-v1",
        "registration_sha256": registration_sha256,
        "corpus_track_ids": ["licensed-track-001", "licensed-track-002"],
        "aggregate": {
            "baseline": {
                "boundary_f_0_5": 0.70,
                "boundary_f_3_0": 0.78,
                "functional_label_accuracy": 0.72,
                "repetition_pairwise_f": 0.74,
                "p50_latency_seconds": 4.0,
                "p95_latency_seconds": 6.0,
                "peak_rss_mib": 650.0,
            },
            "candidate": {
                "boundary_f_0_5": 0.695,
                "boundary_f_3_0": 0.775,
                "functional_label_accuracy": 0.715,
                "repetition_pairwise_f": 0.738,
                "p50_latency_seconds": 1.8,
                "p95_latency_seconds": 4.2,
                "peak_rss_mib": 590.0,
            },
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


def test_registration_digest_is_canonical_and_accepts_required_evidence() -> None:
    """Equivalent key order must not change the frozen preregistration identity."""
    validator = _validator()
    registration = _registration()

    validator.validate_registration(registration)
    digest = validator.registration_digest(registration)
    reordered = dict(reversed(list(registration.items())))

    assert len(digest) == 64
    assert digest == validator.registration_digest(reordered)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda value: value["corpus"][0].update(rights_cleared=False), "rights_cleared"),
        (lambda value: value["corpus"][0].update(audio_sha256="abcd"), "audio_sha256"),
        (
            lambda value: value["corpus"].append(copy.deepcopy(value["corpus"][0])),
            "duplicate track_id",
        ),
    ],
)
def test_registration_rejects_unverifiable_real_audio(
    mutation: object,
    message: str,
) -> None:
    """Rights, content identity, and unique track identity are mandatory evidence."""
    validator = _validator()
    registration = _registration()

    mutation(registration)  # type: ignore[operator]

    with pytest.raises(ValueError, match=message):
        validator.validate_registration(registration)


def test_registration_rejects_incomplete_or_post_hoc_decision_contract() -> None:
    """Every predeclared quality and latency criterion must be present and bounded."""
    validator = _validator()
    registration = _registration()
    metrics = registration["metrics"]
    assert isinstance(metrics, dict)
    del metrics["boundary_f_3_0"]

    with pytest.raises(ValueError, match="boundary_f_3_0"):
        validator.validate_registration(registration)

    registration = _registration()
    metrics = registration["metrics"]
    assert isinstance(metrics, dict)
    latency = metrics["p95_latency_ratio"]
    assert isinstance(latency, dict)
    latency["maximum_candidate_ratio"] = 1.0

    with pytest.raises(ValueError, match="maximum_candidate_ratio"):
        validator.validate_registration(registration)


def test_result_passes_only_when_paired_uncertainty_meets_frozen_contract() -> None:
    """Decision uses paired CI bounds rather than aggregate point estimates alone."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)

    decision = validator.evaluate_result(registration, _result(digest))

    assert decision["passed"] is True
    assert decision["failed_requirements"] == []


def test_result_fails_quality_or_latency_when_ci_crosses_registered_boundary() -> None:
    """A favorable point estimate cannot hide a noninferiority or latency CI miss."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)
    result = _result(digest)
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


def test_result_is_bound_to_registration_corpus_and_finite_measurements() -> None:
    """Results cannot drift thresholds, corpus identity, or numerical validity."""
    validator = _validator()
    registration = _registration()
    digest = validator.registration_digest(registration)

    wrong_digest = _result("0" * 64)
    with pytest.raises(ValueError, match="registration_sha256"):
        validator.evaluate_result(registration, wrong_digest)

    wrong_corpus = _result(digest)
    wrong_corpus["corpus_track_ids"] = ["licensed-track-001"]
    with pytest.raises(ValueError, match="corpus_track_ids"):
        validator.evaluate_result(registration, wrong_corpus)

    nonfinite = _result(digest)
    aggregate = nonfinite["aggregate"]
    assert isinstance(aggregate, dict)
    candidate = aggregate["candidate"]
    assert isinstance(candidate, dict)
    candidate["p95_latency_seconds"] = math.inf
    with pytest.raises(ValueError, match="finite"):
        validator.evaluate_result(registration, nonfinite)
