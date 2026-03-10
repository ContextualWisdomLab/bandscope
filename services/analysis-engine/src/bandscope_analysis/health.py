"""Health helpers for the BandScope analysis engine."""


def build_health_report() -> dict[str, object]:
    """Return the baseline engine readiness payload for harness verification."""
    return {
        "service": "bandscope-analysis",
        "status": "ready",
        "pipeline_stages": ["decode", "draft", "separate", "persist"],
    }
