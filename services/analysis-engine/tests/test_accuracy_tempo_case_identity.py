"""Regression contract for tempo accuracy report identity."""

from __future__ import annotations

from pathlib import Path

from bandscope_analysis.accuracy import (
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    evaluate_click_tempo_file,
    render_click_track,
    write_pcm_wav,
)


def test_click_report_case_id_matches_registered_true_tempo(tmp_path: Path) -> None:
    """A non-default truth label must not be published under the 120 BPM case ID."""
    audio = render_click_track(bpm=DEFAULT_CLICK_BPM, duration_seconds=8.0)
    path = tmp_path / "click-wrong-label.wav"
    digest = write_pcm_wav(path, audio, DEFAULT_SAMPLE_RATE)

    report = evaluate_click_tempo_file(path, digest, true_bpm=40.0)

    assert report["case_id"] == "click-40-bpm"
    assert report["true_label"] == "40 bpm"
    assert report["passed"] is False
