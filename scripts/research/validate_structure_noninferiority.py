#!/usr/bin/env python3
"""Validate preregistered structure-feature noninferiority evidence.

This module does not compute MIR metrics. It binds a reviewed registration to
result receipts produced by the recognized evaluation pipeline, then evaluates
the preregistered confidence-interval decision rules. Metric implementation
authority remains with MIREX/mir_eval-compatible tooling while thresholds,
corpus identity, uncertainty procedure, and runtime identity are protected from
post-result drift.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import stat
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
MAX_EVIDENCE_BYTES = 2 * 1024 * 1024
_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
_WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:")
_URI_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")

_QUALITY_METRICS: dict[str, dict[str, float | str]] = {
    "boundary_f_0_5": {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": 0.5,
    },
    "boundary_f_3_0": {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": 3.0,
    },
    "functional_label_accuracy": {
        "implementation": "mirex2025.frame_level_accuracy",
        "frame_size_seconds": 0.1,
        "annotation_contract_version": 1.0,
        "label_mapping_contract_version": 1.0,
    },
    "repetition_pairwise_f": {
        "implementation": "mir_eval.segment.pairwise",
        "frame_size_seconds": 0.1,
    },
}
_LATENCY_METRIC = "p95_latency_ratio"
_REPORT_SCORE_METRICS = (
    "boundary_precision_0_5",
    "boundary_recall_0_5",
    "boundary_precision_3_0",
    "boundary_recall_3_0",
    "repetition_pairwise_precision",
    "repetition_pairwise_recall",
)
_REPORT_NONNEGATIVE_METRICS = (
    "reference_to_estimate_median_deviation_seconds",
    "estimate_to_reference_median_deviation_seconds",
    "p50_latency_seconds",
    "p95_latency_seconds",
    "peak_rss_mib",
)
_REGISTRATION_FIELDS = {
    "schema_version",
    "experiment_id",
    "hypothesis",
    "metrics",
    "uncertainty",
    "corpus",
    "runtime",
    "claim_boundary",
}
_HYPOTHESIS_FIELDS = {"baseline_feature", "candidate_feature"}
_CORPUS_TRACK_FIELDS = {
    "track_id",
    "audio_sha256",
    "annotation_sha256",
    "rights_basis",
    "rights_cleared",
    "source_uri",
}
_RUNTIME_FIELDS = {
    "source_commit",
    "uv_lock_sha256",
    "python_version",
    "librosa_version",
    "numpy_version",
    "sample_rate_hz",
    "channels",
    "host_profile",
}
_RESULT_FIELDS = {
    "schema_version",
    "experiment_id",
    "registration_sha256",
    "uncertainty",
    "corpus_track_ids",
    "tracks",
    "aggregate",
    "paired_delta_ci95",
    "p95_latency_ratio_ci95",
    "failed_tracks",
    "claim_boundary",
}
_TRACK_RECEIPT_FIELDS = {"track_id", "baseline", "candidate"}
_FAILED_TRACK_RECEIPT_FIELDS = {"track_id"}
_AGGREGATE_FIELDS = {"baseline", "candidate"}


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    """Return ``value`` as a mapping or raise a field-specific error."""
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _require_exact_fields(
    value: Mapping[str, Any],
    expected: set[str],
    field: str,
) -> None:
    """Require an evidence object to use exactly its schema-v1 field set."""
    actual = set(value)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        raise ValueError(f"{field} missing required field: {missing[0]}")
    if extra:
        raise ValueError(f"{field} contains unregistered field: {extra[0]}")


def _sequence(value: object, field: str) -> Sequence[Any]:
    """Return a non-string sequence or raise a field-specific error."""
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise ValueError(f"{field} must be an array")
    return value


def _nonempty_text(value: object, field: str) -> str:
    """Return stripped non-empty text for a required field."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be non-empty text")
    return value.strip()


def _finite_number(value: object, field: str) -> float:
    """Return a finite real number while rejecting booleans and NaN/Inf."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite number")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{field} must be finite")
    return number


def _bounded_integer(
    value: object,
    field: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    """Return a bounded integer while rejecting bools and fractional values."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{field} must be in {minimum}..{maximum}")
    return value


def _score(value: object, field: str) -> float:
    """Return a finite score constrained to the inclusive 0..1 interval."""
    number = _finite_number(value, field)
    if not 0.0 <= number <= 1.0:
        raise ValueError(f"{field} must be between 0 and 1")
    return number


def _sha256(value: object, field: str) -> str:
    """Return a normalized SHA-256 hex digest."""
    text = _nonempty_text(value, field)
    if _SHA256_RE.fullmatch(text) is None:
        raise ValueError(f"{field} must be a 64-character SHA-256 hex digest")
    return text.lower()


def _commit(value: object, field: str) -> str:
    """Return a normalized full Git commit SHA."""
    text = _nonempty_text(value, field)
    if _COMMIT_RE.fullmatch(text) is None:
        raise ValueError(f"{field} must be a full 40-character Git commit SHA")
    return text.lower()


def _reject_local_path(value: object, field: str) -> str:
    """Require an explicit non-file URI for corpus provenance receipts."""
    text = _nonempty_text(value, field)
    lowered = text.casefold()
    scheme = _URI_SCHEME_RE.match(text)
    if (
        text.startswith(("/", "\\\\"))
        or _WINDOWS_DRIVE_RE.match(text) is not None
        or lowered.startswith("file:")
        or scheme is None
        or scheme.end() == len(text)
    ):
        raise ValueError(
            f"{field} must be a provenance URI, not a local filesystem path"
        )
    return text


def _validate_schema_version(value: object, field: str) -> None:
    """Require the one currently supported evidence schema version."""
    if isinstance(value, bool) or value != SCHEMA_VERSION:
        raise ValueError(f"{field} must equal {SCHEMA_VERSION}")


def _validate_metrics(metrics_value: object) -> None:
    """Validate the complete preregistered metric and decision contract."""
    metrics = _mapping(metrics_value, "metrics")
    expected = set(_QUALITY_METRICS) | {_LATENCY_METRIC}
    actual = set(metrics)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        raise ValueError(f"metrics missing required metric: {missing[0]}")
    if extra:
        raise ValueError(f"metrics contains unregistered metric: {extra[0]}")

    for metric_name, expected_config in _QUALITY_METRICS.items():
        config = _mapping(metrics[metric_name], f"metrics.{metric_name}")
        _require_exact_fields(
            config,
            set(expected_config) | {"noninferiority_margin"},
            f"metrics.{metric_name}",
        )
        implementation = _nonempty_text(
            config.get("implementation"),
            f"metrics.{metric_name}.implementation",
        )
        if implementation != expected_config["implementation"]:
            raise ValueError(
                f"metrics.{metric_name}.implementation must equal "
                f"{expected_config['implementation']}"
            )
        for config_name, expected_value in expected_config.items():
            if config_name == "implementation":
                continue
            actual_value = _finite_number(
                config.get(config_name),
                f"metrics.{metric_name}.{config_name}",
            )
            expected_number = float(expected_value)
            if not math.isclose(
                actual_value,
                expected_number,
                rel_tol=0.0,
                abs_tol=1e-12,
            ):
                raise ValueError(
                    f"metrics.{metric_name}.{config_name} must equal "
                    f"{expected_value}"
                )
        margin = _finite_number(
            config.get("noninferiority_margin"),
            f"metrics.{metric_name}.noninferiority_margin",
        )
        if not 0.0 <= margin < 1.0:
            raise ValueError(
                f"metrics.{metric_name}.noninferiority_margin must be in [0, 1)"
            )

    latency = _mapping(metrics[_LATENCY_METRIC], f"metrics.{_LATENCY_METRIC}")
    _require_exact_fields(
        latency,
        {"maximum_candidate_ratio"},
        f"metrics.{_LATENCY_METRIC}",
    )
    maximum_ratio = _finite_number(
        latency.get("maximum_candidate_ratio"),
        f"metrics.{_LATENCY_METRIC}.maximum_candidate_ratio",
    )
    if not 0.0 < maximum_ratio < 1.0:
        raise ValueError(
            "metrics.p95_latency_ratio.maximum_candidate_ratio must be greater "
            "than 0 and less than 1"
        )


def _validate_uncertainty(uncertainty_value: object, field: str) -> dict[str, object]:
    """Validate and normalize the preregistered paired-uncertainty procedure."""
    uncertainty = _mapping(uncertainty_value, field)
    required = {
        "procedure_id",
        "confidence_level",
        "resamples",
        "random_seed",
    }
    missing = sorted(required - set(uncertainty))
    extra = sorted(set(uncertainty) - required)
    if missing:
        raise ValueError(f"{field} missing required field: {missing[0]}")
    if extra:
        raise ValueError(f"{field} contains unregistered field: {extra[0]}")

    procedure_id = _nonempty_text(
        uncertainty.get("procedure_id"),
        f"{field}.procedure_id",
    )
    if len(procedure_id) > 128:
        raise ValueError(f"{field}.procedure_id must be at most 128 characters")

    confidence_level = _finite_number(
        uncertainty.get("confidence_level"),
        f"{field}.confidence_level",
    )
    if not math.isclose(confidence_level, 0.95, rel_tol=0.0, abs_tol=1e-12):
        raise ValueError(f"{field}.confidence_level must equal 0.95")

    resamples = _bounded_integer(
        uncertainty.get("resamples"),
        f"{field}.resamples",
        minimum=1000,
        maximum=10_000_000,
    )
    random_seed = _bounded_integer(
        uncertainty.get("random_seed"),
        f"{field}.random_seed",
        minimum=0,
        maximum=(2**32) - 1,
    )
    return {
        "procedure_id": procedure_id,
        "confidence_level": confidence_level,
        "resamples": resamples,
        "random_seed": random_seed,
    }


def _validate_corpus(corpus_value: object) -> list[str]:
    """Validate rights-cleared real-audio identities and return ordered IDs."""
    corpus = _sequence(corpus_value, "corpus")
    if len(corpus) < 2:
        raise ValueError(
            "corpus must contain at least two rights-cleared real-audio tracks"
        )

    seen_track_ids: set[str] = set()
    seen_audio_sha256: set[str] = set()
    track_ids: list[str] = []
    for index, raw_track in enumerate(corpus):
        field = f"corpus[{index}]"
        track = _mapping(raw_track, field)
        _require_exact_fields(track, _CORPUS_TRACK_FIELDS, field)
        track_id = _nonempty_text(track.get("track_id"), f"{field}.track_id")
        if track_id in seen_track_ids:
            raise ValueError(f"duplicate track_id: {track_id}")
        seen_track_ids.add(track_id)
        track_ids.append(track_id)
        audio_sha256 = _sha256(track.get("audio_sha256"), f"{field}.audio_sha256")
        if audio_sha256 in seen_audio_sha256:
            raise ValueError(f"duplicate audio_sha256: {audio_sha256}")
        seen_audio_sha256.add(audio_sha256)
        _sha256(track.get("annotation_sha256"), f"{field}.annotation_sha256")
        _nonempty_text(track.get("rights_basis"), f"{field}.rights_basis")
        if track.get("rights_cleared") is not True:
            raise ValueError(f"{field}.rights_cleared must be true")
        _reject_local_path(track.get("source_uri"), f"{field}.source_uri")
    return track_ids


def _validate_runtime(runtime_value: object) -> None:
    """Validate exact runtime identity for reproducible paired measurements."""
    runtime = _mapping(runtime_value, "runtime")
    _require_exact_fields(runtime, _RUNTIME_FIELDS, "runtime")
    _commit(runtime.get("source_commit"), "runtime.source_commit")
    _sha256(runtime.get("uv_lock_sha256"), "runtime.uv_lock_sha256")
    for field in (
        "python_version",
        "librosa_version",
        "numpy_version",
        "host_profile",
    ):
        _nonempty_text(runtime.get(field), f"runtime.{field}")

    sample_rate = _finite_number(
        runtime.get("sample_rate_hz"),
        "runtime.sample_rate_hz",
    )
    if not 1.0 <= sample_rate <= 384000.0 or not sample_rate.is_integer():
        raise ValueError("runtime.sample_rate_hz must be an integer in 1..384000")
    channels = runtime.get("channels")
    if isinstance(channels, bool) or channels != 1:
        raise ValueError(
            "runtime.channels must equal 1 for the registered segmentation input"
        )


def validate_registration(registration_value: object) -> None:
    """Validate a frozen STFT-vs-CQT structure experiment registration.

    This function requires content hashes, rights evidence, exact runtime
    identity, recognized metric implementations, explicit margins, and a paired
    uncertainty procedure. Scientific/product choices must be reviewed before
    any corpus result is inspected.
    """
    registration = _mapping(registration_value, "registration")
    _require_exact_fields(registration, _REGISTRATION_FIELDS, "registration")
    _validate_schema_version(
        registration.get("schema_version"),
        "schema_version",
    )
    _nonempty_text(registration.get("experiment_id"), "experiment_id")

    hypothesis = _mapping(registration.get("hypothesis"), "hypothesis")
    _require_exact_fields(hypothesis, _HYPOTHESIS_FIELDS, "hypothesis")
    baseline = _nonempty_text(
        hypothesis.get("baseline_feature"),
        "hypothesis.baseline_feature",
    )
    candidate = _nonempty_text(
        hypothesis.get("candidate_feature"),
        "hypothesis.candidate_feature",
    )
    if baseline != "chroma_cqt":
        raise ValueError("hypothesis.baseline_feature must equal chroma_cqt")
    if candidate != "chroma_stft":
        raise ValueError("hypothesis.candidate_feature must equal chroma_stft")

    _validate_metrics(registration.get("metrics"))
    _validate_uncertainty(registration.get("uncertainty"), "uncertainty")
    _validate_corpus(registration.get("corpus"))
    _validate_runtime(registration.get("runtime"))
    _nonempty_text(registration.get("claim_boundary"), "claim_boundary")


def registration_digest(registration_value: object) -> str:
    """Return the canonical SHA-256 identity of a valid preregistration."""
    validate_registration(registration_value)
    canonical = json.dumps(
        registration_value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _confidence_interval(value: object, field: str) -> tuple[float, float]:
    """Validate and return an ordered two-sided confidence interval."""
    interval = _sequence(value, field)
    if len(interval) != 2:
        raise ValueError(f"{field} must contain exactly two bounds")
    lower = _finite_number(interval[0], f"{field}[0]")
    upper = _finite_number(interval[1], f"{field}[1]")
    if lower > upper:
        raise ValueError(f"{field} lower bound must not exceed upper bound")
    return lower, upper


def _validate_f_triplet(
    normalized: Mapping[str, float],
    *,
    precision_name: str,
    recall_name: str,
    f_name: str,
    field: str,
) -> None:
    """Require reported F to equal the harmonic mean of precision and recall."""
    precision = normalized[precision_name]
    recall = normalized[recall_name]
    denominator = precision + recall
    expected = 0.0 if denominator == 0.0 else (2.0 * precision * recall) / denominator
    actual = normalized[f_name]
    if not math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-12):
        raise ValueError(
            f"{field}.{f_name} must equal the harmonic mean of "
            f"{precision_name} and {recall_name}"
        )


def _validate_measurement_side(
    side_value: object,
    field: str,
) -> dict[str, float]:
    """Validate one per-track or aggregate baseline/candidate measurement."""
    side = _mapping(side_value, field)
    expected_fields = (
        set(_QUALITY_METRICS)
        | set(_REPORT_SCORE_METRICS)
        | set(_REPORT_NONNEGATIVE_METRICS)
    )
    actual_fields = set(side)
    missing_fields = sorted(expected_fields - actual_fields)
    extra_fields = sorted(actual_fields - expected_fields)
    if missing_fields:
        raise ValueError(f"{field} missing required field: {missing_fields[0]}")
    if extra_fields:
        raise ValueError(f"{field} contains unregistered field: {extra_fields[0]}")

    normalized: dict[str, float] = {}
    for metric_name in _QUALITY_METRICS:
        normalized[metric_name] = _score(
            side.get(metric_name),
            f"{field}.{metric_name}",
        )
    for metric_name in _REPORT_SCORE_METRICS:
        normalized[metric_name] = _score(
            side.get(metric_name),
            f"{field}.{metric_name}",
        )
    for metric_name in _REPORT_NONNEGATIVE_METRICS:
        value = _finite_number(side.get(metric_name), f"{field}.{metric_name}")
        if value < 0.0:
            raise ValueError(f"{field}.{metric_name} must be non-negative")
        normalized[metric_name] = value

    _validate_f_triplet(
        normalized,
        precision_name="boundary_precision_0_5",
        recall_name="boundary_recall_0_5",
        f_name="boundary_f_0_5",
        field=field,
    )
    _validate_f_triplet(
        normalized,
        precision_name="boundary_precision_3_0",
        recall_name="boundary_recall_3_0",
        f_name="boundary_f_3_0",
        field=field,
    )
    _validate_f_triplet(
        normalized,
        precision_name="repetition_pairwise_precision",
        recall_name="repetition_pairwise_recall",
        f_name="repetition_pairwise_f",
        field=field,
    )

    if normalized["p95_latency_seconds"] < normalized["p50_latency_seconds"]:
        raise ValueError(
            f"{field}.p95_latency_seconds must be >= p50_latency_seconds"
        )
    return normalized


def _validate_result_identity(
    registration: Mapping[str, Any],
    result: Mapping[str, Any],
) -> list[str]:
    """Bind a result receipt to the frozen registration and corpus order."""
    _require_exact_fields(result, _RESULT_FIELDS, "result")
    _validate_schema_version(
        result.get("schema_version"),
        "result.schema_version",
    )
    registered_experiment_id = _nonempty_text(
        registration.get("experiment_id"),
        "experiment_id",
    )
    experiment_id = _nonempty_text(
        result.get("experiment_id"),
        "result.experiment_id",
    )
    if experiment_id != registered_experiment_id:
        raise ValueError("result.experiment_id does not match registration")

    expected_digest = registration_digest(registration)
    actual_digest = _sha256(
        result.get("registration_sha256"),
        "result.registration_sha256",
    )
    if actual_digest != expected_digest:
        raise ValueError(
            "result.registration_sha256 does not match the frozen registration"
        )

    registered_uncertainty = _validate_uncertainty(
        registration.get("uncertainty"),
        "uncertainty",
    )
    result_uncertainty = _validate_uncertainty(
        result.get("uncertainty"),
        "result.uncertainty",
    )
    if result_uncertainty != registered_uncertainty:
        raise ValueError(
            "result.uncertainty must exactly match the preregistered uncertainty plan"
        )

    expected_track_ids = _validate_corpus(registration["corpus"])
    actual_values = _sequence(
        result.get("corpus_track_ids"),
        "result.corpus_track_ids",
    )
    actual_track_ids = [
        _nonempty_text(value, f"result.corpus_track_ids[{index}]")
        for index, value in enumerate(actual_values)
    ]
    if actual_track_ids != expected_track_ids:
        raise ValueError(
            "result.corpus_track_ids must exactly match registration corpus order"
        )

    registered_claim_boundary = _nonempty_text(
        registration.get("claim_boundary"),
        "claim_boundary",
    )
    result_claim_boundary = _nonempty_text(
        result.get("claim_boundary"),
        "result.claim_boundary",
    )
    if result_claim_boundary != registered_claim_boundary:
        raise ValueError(
            "result.claim_boundary must exactly match the preregistered claim boundary"
        )
    return expected_track_ids


def _validate_failed_tracks(
    result: Mapping[str, Any],
    expected_track_ids: list[str],
) -> list[str]:
    """Validate explicit measurement failures against the registered corpus."""
    failed_values = _sequence(
        result.get("failed_tracks"),
        "result.failed_tracks",
    )
    failed_tracks = [
        _nonempty_text(value, f"result.failed_tracks[{index}]")
        for index, value in enumerate(failed_values)
    ]
    if len(set(failed_tracks)) != len(failed_tracks):
        raise ValueError("result.failed_tracks must not contain duplicates")
    unknown_failed = sorted(set(failed_tracks) - set(expected_track_ids))
    if unknown_failed:
        raise ValueError(
            f"result.failed_tracks contains unknown track_id: {unknown_failed[0]}"
        )
    return failed_tracks


def _validate_track_measurements(
    result: Mapping[str, Any],
    expected_track_ids: list[str],
    failed_track_ids: set[str],
) -> None:
    """Require one explicit success-or-failure receipt for every corpus track."""
    tracks = _sequence(result.get("tracks"), "result.tracks")
    if len(tracks) != len(expected_track_ids):
        raise ValueError(
            "result.tracks must contain exactly one receipt per corpus track"
        )

    actual_track_ids: list[str] = []
    for index, raw_track in enumerate(tracks):
        field = f"result.tracks[{index}]"
        track = _mapping(raw_track, field)
        track_id = _nonempty_text(track.get("track_id"), f"{field}.track_id")
        actual_track_ids.append(track_id)
        if track_id in failed_track_ids:
            _require_exact_fields(track, _FAILED_TRACK_RECEIPT_FIELDS, field)
            continue
        _require_exact_fields(track, _TRACK_RECEIPT_FIELDS, field)
        _validate_measurement_side(track.get("baseline"), f"{field}.baseline")
        _validate_measurement_side(track.get("candidate"), f"{field}.candidate")
    if actual_track_ids != expected_track_ids:
        raise ValueError("result.tracks must preserve the registered corpus order")


def evaluate_result(
    registration_value: object,
    result_value: object,
) -> dict[str, object]:
    """Validate a result receipt and evaluate preregistered CI decisions."""
    validate_registration(registration_value)
    registration = _mapping(registration_value, "registration")
    result = _mapping(result_value, "result")
    track_ids = _validate_result_identity(registration, result)
    failed_tracks = _validate_failed_tracks(result, track_ids)
    _validate_track_measurements(result, track_ids, set(failed_tracks))

    if failed_tracks:
        for field in (
            "aggregate",
            "paired_delta_ci95",
            "p95_latency_ratio_ci95",
        ):
            if result.get(field) is not None:
                raise ValueError(
                    f"result.{field} must be null when result.failed_tracks is non-empty"
                )
        return {
            "passed": False,
            "failed_requirements": [
                "failed tracks are not permitted without a preregistered exclusion "
                "policy: " + ", ".join(failed_tracks)
            ],
            "registration_sha256": registration_digest(registration),
            "failed_tracks": failed_tracks,
        }

    aggregate = _mapping(result.get("aggregate"), "result.aggregate")
    _require_exact_fields(aggregate, _AGGREGATE_FIELDS, "result.aggregate")
    baseline = _validate_measurement_side(
        aggregate.get("baseline"),
        "result.aggregate.baseline",
    )
    candidate = _validate_measurement_side(
        aggregate.get("candidate"),
        "result.aggregate.candidate",
    )

    raw_intervals = _mapping(
        result.get("paired_delta_ci95"),
        "result.paired_delta_ci95",
    )
    if set(raw_intervals) != set(_QUALITY_METRICS):
        raise ValueError(
            "result.paired_delta_ci95 must contain exactly the registered "
            "quality metrics"
        )

    intervals: dict[str, tuple[float, float]] = {}
    for metric_name in _QUALITY_METRICS:
        interval = _confidence_interval(
            raw_intervals[metric_name],
            f"result.paired_delta_ci95.{metric_name}",
        )
        point_delta = candidate[metric_name] - baseline[metric_name]
        if not interval[0] <= point_delta <= interval[1]:
            raise ValueError(
                f"result.paired_delta_ci95.{metric_name} must contain the "
                "aggregate point delta"
            )
        intervals[metric_name] = interval

    latency_interval = _confidence_interval(
        result.get("p95_latency_ratio_ci95"),
        "result.p95_latency_ratio_ci95",
    )
    if latency_interval[0] <= 0.0:
        raise ValueError(
            "result.p95_latency_ratio_ci95 bounds must be greater than 0"
        )
    baseline_p95 = baseline["p95_latency_seconds"]
    if baseline_p95 <= 0.0:
        raise ValueError(
            "result.aggregate.baseline.p95_latency_seconds must be greater than 0"
        )
    latency_ratio = candidate["p95_latency_seconds"] / baseline_p95
    if not latency_interval[0] <= latency_ratio <= latency_interval[1]:
        raise ValueError(
            "result.p95_latency_ratio_ci95 must contain the aggregate p95 ratio"
        )

    metrics = _mapping(registration["metrics"], "metrics")
    failed_requirements: list[str] = []
    for metric_name in _QUALITY_METRICS:
        config = _mapping(metrics[metric_name], f"metrics.{metric_name}")
        margin = _finite_number(
            config.get("noninferiority_margin"),
            f"metrics.{metric_name}.noninferiority_margin",
        )
        lower = intervals[metric_name][0]
        if lower < -margin:
            failed_requirements.append(
                f"{metric_name} paired CI lower bound {lower:.6f} "
                f"is below -{margin:.6f}"
            )

    latency_config = _mapping(
        metrics[_LATENCY_METRIC],
        f"metrics.{_LATENCY_METRIC}",
    )
    maximum_ratio = _finite_number(
        latency_config.get("maximum_candidate_ratio"),
        f"metrics.{_LATENCY_METRIC}.maximum_candidate_ratio",
    )
    latency_upper = latency_interval[1]
    if latency_upper > maximum_ratio:
        failed_requirements.append(
            "p95 latency ratio CI upper bound "
            f"{latency_upper:.6f} exceeds {maximum_ratio:.6f}"
        )

    return {
        "passed": not failed_requirements,
        "failed_requirements": failed_requirements,
        "registration_sha256": registration_digest(registration),
        "failed_tracks": failed_tracks,
    }


def _reject_duplicate_object_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject duplicate JSON object keys instead of accepting last-key-wins."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _reject_json_constant(value: str) -> None:
    """Reject non-standard JSON NaN/Infinity constants at the parser boundary."""
    raise ValueError(f"invalid JSON constant: {value}")


def _load_json(path: Path) -> object:
    """Load one bounded regular non-link UTF-8 JSON file from one descriptor."""
    flags = os.O_RDONLY
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise ValueError(
            f"evidence path could not be opened as a regular non-link file: {path.name}"
        ) from exc

    with os.fdopen(fd, "rb", closefd=True) as handle:
        descriptor_stat = os.fstat(handle.fileno())
        if not stat.S_ISREG(descriptor_stat.st_mode):
            raise ValueError(f"evidence path is not a regular file: {path.name}")
        if not hasattr(os, "O_NOFOLLOW") and path.is_symlink():
            raise ValueError(f"evidence path must not be a symbolic link: {path.name}")
        if descriptor_stat.st_size > MAX_EVIDENCE_BYTES:
            raise ValueError(
                f"evidence file exceeds {MAX_EVIDENCE_BYTES} bytes: {path.name}"
            )
        payload = handle.read(MAX_EVIDENCE_BYTES + 1)

    if len(payload) > MAX_EVIDENCE_BYTES:
        raise ValueError(
            f"evidence file exceeds {MAX_EVIDENCE_BYTES} bytes: {path.name}"
        )
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"evidence file is not valid UTF-8: {path.name}") from exc
    try:
        return json.loads(
            text,
            object_pairs_hook=_reject_duplicate_object_pairs,
            parse_constant=_reject_json_constant,
        )
    except json.JSONDecodeError as exc:
        raise ValueError(f"evidence file is not valid JSON: {path.name}") from exc


def main(argv: Sequence[str] | None = None) -> int:
    """Validate a registration and optionally evaluate one bound result."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registration", type=Path)
    parser.add_argument("result", type=Path, nargs="?")
    args = parser.parse_args(argv)

    registration = _load_json(args.registration)
    digest = registration_digest(registration)
    if args.result is None:
        print(json.dumps({"registration_sha256": digest}, sort_keys=True))
        return 0

    result = _load_json(args.result)
    decision = evaluate_result(registration, result)
    print(json.dumps(decision, sort_keys=True))
    return 0 if decision["passed"] is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
