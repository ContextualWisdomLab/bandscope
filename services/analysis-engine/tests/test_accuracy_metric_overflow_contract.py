"""Regression tests for accuracy-report numeric overflow authority."""

from __future__ import annotations

import pytest

from bandscope_analysis.accuracy import build_case_report, parse_case_report


def test_accuracy_report_rejects_integer_metric_that_overflows_float() -> None:
    """Huge integer metrics must fail closed instead of escaping validation."""
    valid = build_case_report(
        case_id="c-major-triad",
        audio_sha256="a" * 64,
        metric_name="duration_weighted_chord_recall",
        metric_value=0.9,
        passed=True,
        true_label="C",
        engine_version="0.1.3",
    )

    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": 10**400})


def test_build_case_report_rejects_boolean_metric_evidence() -> None:
    """Builder coercion must not turn Boolean evidence into a numeric score."""
    with pytest.raises(ValueError, match="metric_value"):
        build_case_report(
            case_id="c-major-triad",
            audio_sha256="a" * 64,
            metric_name="duration_weighted_chord_recall",
            metric_value=True,
            passed=True,
            true_label="C",
            engine_version="0.1.3",
        )
