from bandscope_analysis.api import get_analysis_status


def test_get_analysis_status_returns_health_payload() -> None:
    assert get_analysis_status() == {
        "service": "bandscope-analysis",
        "status": "ready",
        "pipeline_stages": ["decode", "draft", "separate", "persist"],
    }
