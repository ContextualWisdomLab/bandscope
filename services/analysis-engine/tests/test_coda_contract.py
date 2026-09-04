"""Regression coverage for the native demo coda contract."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import build_demo_rehearsal_song, run_analysis_job_updates


def test_native_demo_publishes_trusted_coda_destination() -> None:
    """The packaged native demo exposes the same trusted coda as the browser demo."""
    song = build_demo_rehearsal_song()

    assert song.get("coda") == {"label": "Coda"}


def test_non_demo_fallback_does_not_invent_coda_authority() -> None:
    """Local-analysis fallback must not manufacture a coda without stored evidence."""
    song = build_demo_rehearsal_song({}, include_demo_coda=False)

    assert "coda" not in song


def test_pipeline_fallback_does_not_invent_coda_authority() -> None:
    """An empty real-analysis mix falls back without gaining demo coda authority."""
    song = build_demo_rehearsal_song(
        {
            "stems": {"bass": np.array([], dtype=np.float32)},
            "sr": 22_050,
            "separation": {"duration_seconds": 1.0},
        }
    )

    assert "coda" not in song


def test_local_audio_runtime_fallback_does_not_invent_coda_authority() -> None:
    """Unavailable local separation may return cues but must not fabricate a coda."""
    payload = {
        "sourceKind": "local_audio",
        "projectId": "coda-local-fallback",
        "sourceLabel": "rehearsal.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": "/tmp/rehearsal.wav",
            "fileName": "rehearsal.wav",
            "extension": "wav",
            "fileSizeBytes": 1024,
        },
    }

    with patch(
        "bandscope_analysis.api._build_local_audio_features",
        side_effect=RuntimeError("separator unavailable"),
    ):
        updates = run_analysis_job_updates(
            "job-coda-local-fallback",
            payload,
            "2026-08-30T12:00:00Z",
        )

    result = updates[-1].get("result")
    assert updates[-1]["state"] == "succeeded"
    assert result is not None
    assert "coda" not in result
