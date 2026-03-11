"""Public API helpers for the BandScope analysis baseline."""

from bandscope_analysis.health import HealthReport, build_health_report


def get_analysis_status() -> HealthReport:
    """Expose a small API-shaped status payload for CI and app wiring."""
    return build_health_report()
