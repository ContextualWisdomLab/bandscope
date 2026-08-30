"""Contract tests for authoritative first-chart-bar metadata."""

from unittest.mock import patch

from bandscope_analysis.api import build_demo_rehearsal_song, run_analysis_job_updates


def test_native_demo_rehearsal_song_carries_authoritative_first_bar() -> None:
    """Keep the native demo payload aligned with the browser's printed-chart fixture."""
    song = build_demo_rehearsal_song()

    assert song["sections"][0]["measureStart"] == 9


def test_local_audio_fallback_does_not_invent_demo_chart_bar() -> None:
    """Keep real-audio fallback cues free of printed-chart authority."""
    with patch(
        "bandscope_analysis.api._build_local_audio_features",
        side_effect=RuntimeError("stem backend unavailable"),
    ):
        updates = run_analysis_job_updates(
            "job-first-bar-fallback",
            {
                "sourceKind": "local_audio",
                "projectId": "project-first-bar",
                "sourceLabel": "rehearsal.wav",
                "roleFocus": ["bass-guitar"],
                "localSource": {
                    "sourcePath": "/Music/rehearsal.wav",
                    "fileName": "rehearsal.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024,
                },
            },
            "2026-08-30T00:00:00Z",
        )

    result = updates[-1]["result"]
    assert "measureStart" not in result["sections"][0]
