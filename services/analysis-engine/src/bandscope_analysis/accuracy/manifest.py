"""Accuracy-case report schema for exact-value acceptance evidence."""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

REQUIRED_REPORT_KEYS = frozenset(
    {
        "case_id",
        "audio_sha256",
        "metric_name",
        "metric_value",
        "passed",
        "engine_version",
        "true_label",
    }
)


class AccuracyCaseReport(TypedDict):
    """One scored fixture case that a buyer can read without opening logs."""

    case_id: str
    audio_sha256: str
    metric_name: str
    metric_value: float
    passed: bool
    engine_version: str
    true_label: str


def read_product_version(start: Path | None = None) -> str:
    """Return the nearest ``VERSION`` file contents, or ``unknown``.

    Args:
        start: File or directory to walk upward from. Defaults to this module.

    Returns:
        Stripped version text, or ``unknown`` when no non-empty file is found.
    """
    current = start if start is not None else Path(__file__).resolve()
    cursor = current.parent if current.is_file() else current
    for parent in (cursor, *cursor.parents):
        candidate = parent / "VERSION"
        if not candidate.is_file():
            continue
        text = candidate.read_text(encoding="utf-8").strip()
        if text:
            return text
    return "unknown"


def build_case_report(
    *,
    case_id: str,
    audio_sha256: str,
    metric_name: str,
    metric_value: float,
    passed: bool,
    true_label: str,
    engine_version: str | None = None,
) -> AccuracyCaseReport:
    """Build a validated accuracy case report.

    Args:
        case_id: Stable fixture identifier such as ``c-major-triad``.
        audio_sha256: Digest of the decoded fixture bytes.
        metric_name: Registered metric id such as ``duration_weighted_chord_recall``.
        metric_value: Numeric score for this run.
        passed: Whether the score met the registered tolerance.
        true_label: Ground-truth label the buyer should hear.
        engine_version: Optional override. Defaults to the product ``VERSION``.

    Returns:
        A report that ``parse_case_report`` will accept.
    """
    report: AccuracyCaseReport = {
        "case_id": case_id,
        "audio_sha256": audio_sha256,
        "metric_name": metric_name,
        "metric_value": float(metric_value),
        "passed": passed,
        "engine_version": engine_version if engine_version is not None else read_product_version(),
        "true_label": true_label,
    }
    return parse_case_report(report)


def parse_case_report(value: object) -> AccuracyCaseReport:
    """Validate an accuracy case report and return a typed copy.

    Args:
        value: Untrusted mapping, typically loaded from JSON.

    Returns:
        The same fields after type and presence checks.

    Raises:
        ValueError: If the payload is missing keys or uses the wrong types.
    """
    if not isinstance(value, dict):
        raise ValueError("Accuracy case report must be an object")

    missing = REQUIRED_REPORT_KEYS.difference(value)
    if missing:
        missing_names = ", ".join(sorted(missing))
        raise ValueError(f"Accuracy case report is missing: {missing_names}")

    case_id = value["case_id"]
    audio_sha256 = value["audio_sha256"]
    metric_name = value["metric_name"]
    metric_value = value["metric_value"]
    passed = value["passed"]
    engine_version = value["engine_version"]
    true_label = value["true_label"]

    if not isinstance(case_id, str) or not case_id:
        raise ValueError("case_id must be a non-empty string")
    if not isinstance(audio_sha256, str) or len(audio_sha256) != 64:
        raise ValueError("audio_sha256 must be a 64-character hex digest")
    if not isinstance(metric_name, str) or not metric_name:
        raise ValueError("metric_name must be a non-empty string")
    if isinstance(metric_value, bool) or not isinstance(metric_value, (int, float)):
        raise ValueError("metric_value must be a number")
    if not isinstance(passed, bool):
        raise ValueError("passed must be a boolean")
    if not isinstance(engine_version, str) or not engine_version:
        raise ValueError("engine_version must be a non-empty string")
    if not isinstance(true_label, str) or not true_label:
        raise ValueError("true_label must be a non-empty string")

    return {
        "case_id": case_id,
        "audio_sha256": audio_sha256,
        "metric_name": metric_name,
        "metric_value": float(metric_value),
        "passed": passed,
        "engine_version": engine_version,
        "true_label": true_label,
    }
