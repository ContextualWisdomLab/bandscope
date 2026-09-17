#!/usr/bin/env python3
"""Validate preregistered structure-feature noninferiority evidence.

This module deliberately does not compute MIR metrics. It binds a reviewed
registration to result receipts produced by the recognized evaluation pipeline,
then evaluates the preregistered confidence-interval decision rules. That keeps
metric implementation authority with MIREX/mir_eval-compatible tooling while
preventing thresholds, corpus identity, or runtime identity from drifting after
results are observed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
_WINDOWS_ABSOLUTE_RE = re.compile(r"^[A-Za-z]:[\\/]")

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
    },
    "repetition_pairwise_f": {
        "implementation": "mir_eval.segment.pairwise",
        "frame_size_seconds": 0.1,
    },
}
_LATENCY_METRIC = "p95_latency_ratio"
_REPORT_METRICS = (
    "p50_latency_seconds",
    "p95_latency_seconds",
    "peak_rss_mib",
)


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    """Return ``value`` as a mapping or raise a field-specific validation error."""
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _sequence(value: object, field: str) -> Sequence[Any]:
    """Return a non-string sequence or raise a field-specific validation error."""
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise ValueError(f"{field} must be an array")
    return value


def _nonempty_text(value: object, field: str) -> str:
    """Return stripped non-empty text for a required textual field."""
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
    """Reject local filesystem authorities from corpus provenance receipts."""
    text = _nonempty_text(value, field)
    lowered = text.casefold()
    if (
        text.startswith(("/", "\\\\"))
        or _WINDOWS_ABSOLUTE_RE.match(text) is not None
        or lowered.startswith("file:")
    ):
        raise ValueError(f"{field} must be a provenance URI, not a local filesystem path")
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
            if not math.isclose(actual_value, float(expected_value), rel_tol=0.0, abs_tol=1e-12):
                raise ValueError(
                    f"metrics.{metric_name}.{config_name} must equal {expected_value}"
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
    maximum_ratio = _finite_number(
        latency.get("maximum_candidate_ratio"),
        f"metrics.{_LATENCY_METRIC}.maximum_candidate_ratio",
    )
    if not 0.0 < maximum_ratio < 1.0:
        raise ValueError(
            "metrics.p95_latency_ratio.maximum_candidate_ratio must be greater than 0 "
            "and less than 1"
        )


def _validate_corpus(corpus_value: object) -> list[str]:
    """Validate rights-cleared real-audio identities and return ordered track IDs."""
    corpus = _sequence(corpus_value, "corpus")
    if len(corpus) < 2:
        raise ValueError("corpus must contain at least two rights-cleared real-audio tracks")

    seen: set[str] = set()
    track_ids: list[str] = []
    for index, raw_track in enumerate(corpus):
        field = f"corpus[{index}]"
        track = _mapping(raw_track, field)
        track_id = _nonempty_text(track.get("track_id"), f"{field}.track_id")
        if track_id in seen:
            raise ValueError(f"duplicate track_id: {track_id}")
        seen.add(track_id)
        track_ids.append(track_id)
        _sha256(track.get("audio_sha256"), f"{field}.audio_sha256")
        _sha256(track.get("annotation_sha256"), f"{field}.annotation_sha256")
        _nonempty_text(track.get("rights_basis"), f"{field}.rights_basis")
        if track.get("rights_cleared") is not True:
            raise ValueError(f"{field}.rights_cleared must be true")
        _reject_local_path(track.get("source_uri"), f"{field}.source_uri")
    return track_ids


def _validate_runtime(runtime_value: object) -> None:
    """Validate exact runtime identity needed to reproduce paired measurements."""
    runtime = _mapping(runtime_value, "runtime")
    _commit(runtime.get("source_commit"), "runtime.source_commit")
    _sha256(runtime.get("uv_lock_sha256"), "runtime.uv_lock_sha256")
    for field in ("python_version", "librosa_version", "numpy_version", "host_profile"):
        _nonempty_text(runtime.get(field), f"runtime.{field}")

    sample_rate = _finite_number(runtime.get("sample_rate_hz"), "runtime.sample_rate_hz")
    if not 1.0 <= sample_rate <= 384000.0 or not sample_rate.is_integer():
        raise ValueError("runtime.sample_rate_hz must be an integer in 1..384000")
    channels = runtime.get("channels")
    if isinstance(channels, bool) or channels != 1:
        raise ValueError("runtime.channels must equal 1 for the registered segmentation input")


def validate_registration(registration_value: object) -> None:
    """Validate a frozen STFT-vs-CQT structure experiment registration.

    The validator intentionally requires content hashes, rights evidence, exact
    runtime identity, recognized metric implementations, and explicit margins.
    It does not decide what the margins should be; that scientific/product
    choice must be reviewed before any corpus result is inspected.
    """
    registration = _mapping(registration_value, "registration")
    _validate_schema_version(registration.get("schema_version"), "schema_version")
    _nonempty_text(registration.get("experiment_id"), "experiment_id")

    hypothesis = _mapping(registration.get("hypothesis"), "hypothesis")
    baseline = _nonempty_text(hypothesis.get("baseline_feature"), "hypothesis.baseline_feature")
    candidate = _nonempty_text(
        hypothesis.get("candidate_feature"),
        "hypothesis.candidate_feature",
    )
    if baseline != "chroma_cqt":
        raise ValueError("hypothesis.baseline_feature must equal chroma_cqt")
    if candidate != "chroma_stft":
        raise ValueError("hypothesis.candidate_feature must equal chroma_stft")

    _validate_metrics(registration.get("metrics"))
    _validate_corpus(registration.get("corpus"))
    _validate_runtime(registration.get("runtime"))


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


def _validate_aggregate_side(side_value: object, field: str) -> dict[str, float]:
    """Validate one aggregate baseline/candidate result side."""
    side = _mapping(side_value, field)
    normalized: dict[str, float] = {}
    for metric_name in _QUALITY_METRICS:
        normalized[metric_name] = _score(side.get(metric_name), f"{field}.{metric_name}")
    for metric_name in _REPORT_METRICS:
        value = _finite_number(side.get(metric_name), f"{field}.{metric_name}")
        if value < 0.0:
            raise ValueError(f"{field}.{metric_name} must be non-negative")
        normalized[metric_name] = value
    if normalized["p95_latency_seconds"] < normalized["p50_latency_seconds"]:
        raise ValueError(f"{field}.p95_latency_seconds must be >= p50_latency_seconds")
    return normalized


def _validate_result_identity(
    registration: Mapping[str, Any],
    result: Mapping[str, Any],
) -> list[str]:
    """Bind a result receipt to the frozen registration and exact corpus order."""
    _validate_schema_version(result.get("schema_version"), "result.schema_version")
    experiment_id = _nonempty_text(result.get("experiment_id"), "result.experiment_id")
    if experiment_id != registration["experiment_id"]:
        raise ValueError("result.experiment_id does not match registration")

    expected_digest = registration_digest(registration)
    actual_digest = _sha256(result.get("registration_sha256"), "result.registration_sha256")
    if actual_digest != expected_digest:
        raise ValueError("result.registration_sha256 does not match the frozen registration")

    expected_track_ids = _validate_corpus(registration["corpus"])
    actual_track_values = _sequence(result.get("corpus_track_ids"), "result.corpus_track_ids")
    actual_track_ids = [
        _nonempty_text(value, f"result.corpus_track_ids[{index}]")
        for index, value in enumerate(actual_track_values)
    ]
    if actual_track_ids != expected_track_ids:
        raise ValueError("result.corpus_track_ids must exactly match registration corpus order")
    return expected_track_ids


def evaluate_result(
    registration_value: object,
    result_value: object,
) -> dict[str, object]:
    """Validate a result receipt and evaluate preregistered CI-based decisions."""
    validate_registration(registration_value)
    registration = _mapping(registration_value, "registration")
    result = _mapping(result_value, "result")
    track_ids = _validate_result_identity(registration, result)

    aggregate = _mapping(result.get("aggregate"), "result.aggregate")
    baseline = _validate_aggregate_side(aggregate.get("baseline"), "result.aggregate.baseline")
    candidate = _validate_aggregate_side(
        aggregate.get("candidate"),
        "result.aggregate.candidate",
    )

    raw_intervals = _mapping(result.get("paired_delta_ci95"), "result.paired_delta_ci95")
    if set(raw_intervals) != set(_QUALITY_METRICS):
        raise ValueError("result.paired_delta_ci95 must contain exactly the registered quality metrics")

    intervals: dict[str, tuple[float, float]] = {}
    for metric_name in _QUALITY_METRICS:
        interval = _confidence_interval(
            raw_intervals[metric_name],
            f"result.paired_delta_ci95.{metric_name}",
        )
        point_delta = candidate[metric_name] - baseline[metric_name]
        if not interval[0] <= point_delta <= interval[1]:
            raise ValueError(
                f"result.paired_delta_ci95.{metric_name} must contain the aggregate point delta"
            )
        intervals[metric_name] = interval

    latency_interval = _confidence_interval(
        result.get("p95_latency_ratio_ci95"),
        "result.p95_latency_ratio_ci95",
    )
    if latency_interval[0] <= 0.0:
        raise ValueError("result.p95_latency_ratio_ci95 bounds must be greater than 0")
    baseline_p95 = baseline["p95_latency_seconds"]
    if baseline_p95 <= 0.0:
        raise ValueError("result.aggregate.baseline.p95_latency_seconds must be greater than 0")
    latency_ratio = candidate["p95_latency_seconds"] / baseline_p95
    if not latency_interval[0] <= latency_ratio <= latency_interval[1]:
        raise ValueError("result.p95_latency_ratio_ci95 must contain the aggregate p95 ratio")

    failed_tracks_raw = _sequence(result.get("failed_tracks"), "result.failed_tracks")
    failed_tracks = [
        _nonempty_text(value, f"result.failed_tracks[{index}]")
        for index, value in enumerate(failed_tracks_raw)
    ]
    if len(set(failed_tracks)) != len(failed_tracks):
        raise ValueError("result.failed_tracks must not contain duplicates")
    unknown_failed = sorted(set(failed_tracks) - set(track_ids))
    if unknown_failed:
        raise ValueError(f"result.failed_tracks contains unknown track_id: {unknown_failed[0]}")
    _nonempty_text(result.get("claim_boundary"), "result.claim_boundary")

    metrics = _mapping(registration["metrics"], "metrics")
    failed_requirements: list[str] = []
    for metric_name in _QUALITY_METRICS:
        metric_config = _mapping(metrics[metric_name], f"metrics.{metric_name}")
        margin = _finite_number(
            metric_config.get("noninferiority_margin"),
            f"metrics.{metric_name}.noninferiority_margin",
        )
        lower = intervals[metric_name][0]
        if lower < -margin:
            failed_requirements.append(
                f"{metric_name} paired CI lower bound {lower:.6f} is below -{margin:.6f}"
            )

    latency_config = _mapping(metrics[_LATENCY_METRIC], f"metrics.{_LATENCY_METRIC}")
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


def _load_json(path: Path) -> object:
    """Load one UTF-8 JSON evidence file."""
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main(argv: Sequence[str] | None = None) -> int:
    """Validate a registration and optionally evaluate one bound result receipt."""
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
