"""Regression tests for accuracy-report string evidence authority."""

from __future__ import annotations

import pytest

from bandscope_analysis.accuracy import build_case_report, parse_case_report


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("case_id", "   "),
        ("case_id", " c-major-triad "),
        ("metric_name", "   "),
        ("metric_name", " tempo_acc1 "),
        ("true_label", "   "),
        ("true_label", " C "),
    ],
)
def test_accuracy_report_rejects_blank_or_padded_string_evidence(
    field_name: str,
    invalid_value: str,
) -> None:
    """Identifiers and truth labels must be exact non-blank evidence strings."""
    valid = build_case_report(
        case_id="c-major-triad",
        audio_sha256="a" * 64,
        metric_name="duration_weighted_chord_recall",
        metric_value=0.9,
        passed=True,
        true_label="C",
        engine_version="0.1.3",
    )

    with pytest.raises(ValueError, match=field_name):
        parse_case_report({**valid, field_name: invalid_value})
