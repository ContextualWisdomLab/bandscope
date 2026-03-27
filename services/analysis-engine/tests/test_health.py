"""Tests for the analysis-engine health helpers."""

from bandscope_analysis.health import build_health_report


def test_build_health_report_exposes_bootstrap_defaults() -> None:
    """Ensure the bootstrap health payload exposes the expected default stages."""
    assert build_health_report() == {
        "service": "bandscope-analysis",
        "status": "ready",
        "pipeline_stages": ["decode", "draft", "separate", "persist"],
    }
