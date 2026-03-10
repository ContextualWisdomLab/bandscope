"""Public API helpers for the BandScope analysis baseline."""

from bandscope_analysis.health import build_health_report


def get_analysis_status() -> dict[str, object]:
    """Expose a small API-shaped status payload for CI and app wiring."""
    return build_health_report()
