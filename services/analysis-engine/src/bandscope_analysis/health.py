"""Health helpers for the BandScope analysis engine."""

from typing import Literal, TypedDict


class HealthReport(TypedDict):
    service: Literal["bandscope-analysis"]
    status: Literal["ready"]
    pipeline_stages: list[Literal["decode", "draft", "separate", "persist"]]


def build_health_report() -> HealthReport:
    """Return the baseline engine readiness payload for harness verification."""
    return {
        "service": "bandscope-analysis",
        "status": "ready",
        "pipeline_stages": ["decode", "draft", "separate", "persist"],
    }
