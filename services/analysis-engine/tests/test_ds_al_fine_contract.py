"""Regression tests for D.S. al Fine propagation through the analysis API."""

from unittest.mock import patch

from bandscope_analysis.api import run_analysis_job


def test_demo_analysis_returns_trusted_ds_al_fine() -> None:
    """Keep native demo analysis aligned with the desktop demo song contract."""
    status = run_analysis_job(
        "job-demo-ds-al-fine",
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar", "lead-vocal"],
        },
        "2026-08-31T00:00:00Z",
    )

    result = status.get("result")
    assert status["state"] == "succeeded"
    assert result is not None
    assert result.get("dsAlFine") == {"label": "D.S. al Fine"}


def test_local_audio_fallback_does_not_invent_ds_al_fine() -> None:
    """Never fabricate notation marks when local audio has no trusted score metadata."""
    request = {
        "sourceKind": "local_audio",
        "projectId": "project-no-score-mark",
        "sourceLabel": "plain-song.wav",
        "roleFocus": ["bass-guitar"],
        "localSource": {
            "sourcePath": "/tmp/plain-song.wav",
            "fileName": "plain-song.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
        },
    }

    with patch(
        "bandscope_analysis.api._build_local_audio_features",
        side_effect=RuntimeError("separator unavailable"),
    ):
        status = run_analysis_job("job-local-no-ds-al-fine", request, "2026-08-31T00:00:00Z")

    result = status.get("result")
    assert status["state"] == "succeeded"
    assert result is not None
    assert "dsAlFine" not in result
