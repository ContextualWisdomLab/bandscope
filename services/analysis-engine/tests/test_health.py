from bandscope_analysis.health import build_health_report


def test_build_health_report_exposes_bootstrap_defaults() -> None:
    assert build_health_report() == {
        "service": "bandscope-analysis",
        "status": "ready",
        "pipeline_stages": ["decode", "draft", "separate", "persist"],
    }
