"""Regression tests for accuracy-report engine-version provenance."""

from __future__ import annotations

from pathlib import Path

import pytest

from bandscope_analysis.accuracy import build_case_report, parse_case_report, read_product_version


def test_missing_or_empty_product_version_fails_closed(tmp_path: Path) -> None:
    """Accuracy evidence must not publish an ``unknown`` engine version."""
    missing_tree = tmp_path / "missing-tree"
    missing_tree.mkdir()
    with pytest.raises(ValueError, match="VERSION"):
        read_product_version(missing_tree)

    empty_tree = tmp_path / "empty-tree"
    empty_tree.mkdir()
    (empty_tree / "VERSION").write_text("   \n", encoding="utf-8")
    with pytest.raises(ValueError, match="VERSION"):
        read_product_version(empty_tree)


@pytest.mark.parametrize("engine_version", ["unknown", "UNKNOWN", " 0.1.3 "])
def test_inexact_engine_version_is_rejected_at_report_boundary(engine_version: str) -> None:
    """Unknown or whitespace-obscured versions must not become valid evidence."""
    report = {
        "case_id": "c-major-triad",
        "audio_sha256": "a" * 64,
        "metric_name": "duration_weighted_chord_recall",
        "metric_value": 0.9,
        "passed": True,
        "engine_version": engine_version,
        "true_label": "C",
    }
    with pytest.raises(ValueError, match="engine_version"):
        parse_case_report(report)
    with pytest.raises(ValueError, match="engine_version"):
        build_case_report(
            case_id="c-major-triad",
            audio_sha256="a" * 64,
            metric_name="duration_weighted_chord_recall",
            metric_value=0.9,
            passed=True,
            true_label="C",
            engine_version=engine_version,
        )
