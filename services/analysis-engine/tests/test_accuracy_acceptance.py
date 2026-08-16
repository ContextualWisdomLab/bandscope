"""Real-audio accuracy acceptance for decoded PCM fixtures.

These cases prove a buyer-visible claim: a known waveform written to disk,
decoded, and analyzed yields the expected chord or tempo. Mocked chroma
matrices are not acceptance evidence.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.accuracy import (
    C_MAJOR_LABEL,
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    assert_fixture_checksum,
    build_case_report,
    duration_weighted_chord_recall,
    evaluate_c_major_pcm,
    evaluate_click_tempo_file,
    parse_case_report,
    read_product_version,
    render_c_major_triad,
    render_click_track,
    tempo_acc1,
    write_pcm_wav,
)
from bandscope_analysis.accuracy.evaluate import C_MAJOR_RECALL_FLOOR
from bandscope_analysis.api import build_demo_rehearsal_song


def test_c_major_fixture_is_deterministic(tmp_path: Path) -> None:
    """Two writes of the same triad must share one SHA-256 digest."""
    audio = render_c_major_triad()
    first = write_pcm_wav(tmp_path / "a.wav", audio, DEFAULT_SAMPLE_RATE)
    second = write_pcm_wav(tmp_path / "b.wav", audio, DEFAULT_SAMPLE_RATE)
    assert first == second
    assert len(first) == 64


def test_c_major_wav_recovers_c_after_file_decode(tmp_path: Path) -> None:
    """A decoded C major WAV must recover C for most of the fixture duration."""
    audio = render_c_major_triad(duration_seconds=3.0)
    digest = write_pcm_wav(tmp_path / "c-major.wav", audio, DEFAULT_SAMPLE_RATE)
    assert_fixture_checksum(tmp_path / "c-major.wav", digest)
    report = evaluate_c_major_pcm(audio, DEFAULT_SAMPLE_RATE, digest)
    assert report["true_label"] == C_MAJOR_LABEL
    assert report["metric_name"] == "duration_weighted_chord_recall"
    assert report["metric_value"] >= C_MAJOR_RECALL_FLOOR
    assert report["passed"] is True
    assert report["audio_sha256"] == digest


def test_click_wav_recovers_120_bpm_acc1(tmp_path: Path) -> None:
    """A decoded 120 BPM click WAV must pass tempo Acc1."""
    audio = render_click_track(bpm=DEFAULT_CLICK_BPM, duration_seconds=8.0)
    path = tmp_path / "click-120.wav"
    digest = write_pcm_wav(path, audio, DEFAULT_SAMPLE_RATE)
    report = evaluate_click_tempo_file(path, digest, DEFAULT_CLICK_BPM)
    assert report["passed"] is True
    assert report["metric_name"] == "tempo_acc1"
    assert report["true_label"] == "120 bpm"


def test_silence_does_not_pass_c_major_recall() -> None:
    """Silence must not be reported as a passing C major acceptance case."""
    silence = np.zeros(DEFAULT_SAMPLE_RATE, dtype=np.float32)
    report = evaluate_c_major_pcm(silence, DEFAULT_SAMPLE_RATE, "b" * 64)
    assert report["passed"] is False
    assert report["metric_value"] < C_MAJOR_RECALL_FLOOR


def test_click_tempo_acc1_fails_when_true_tempo_is_wrong(tmp_path: Path) -> None:
    """Acc1 must fail when the registered true tempo is not the click tempo."""
    audio = render_click_track(bpm=DEFAULT_CLICK_BPM, duration_seconds=8.0)
    path = tmp_path / "click-wrong-label.wav"
    digest = write_pcm_wav(path, audio, DEFAULT_SAMPLE_RATE)
    report = evaluate_click_tempo_file(path, digest, true_bpm=40.0)
    assert report["passed"] is False
    assert report["metric_value"] == 0.0


def test_checksum_mismatch_fails_closed(tmp_path: Path) -> None:
    """A tampered fixture must not be scored as a passing case."""
    audio = render_click_track()
    path = tmp_path / "click.wav"
    write_pcm_wav(path, audio, DEFAULT_SAMPLE_RATE)
    with pytest.raises(ValueError, match="checksum mismatch"):
        assert_fixture_checksum(path, "0" * 64)


def test_pipeline_surfaces_c_on_active_lead_vocal() -> None:
    """Unmocked assembly must put measured C on lead vocal when that stem is active."""
    audio = render_c_major_triad(duration_seconds=3.0)
    silence = np.zeros_like(audio)
    song = build_demo_rehearsal_song(
        {
            "stems": {
                "vocals": audio * np.float32(0.35),
                "bass": silence,
                "drums": silence,
                "other": audio,
            },
            "sr": DEFAULT_SAMPLE_RATE,
            "separation": {"duration_seconds": 3.0, "chunk_count": 1, "notes": "accuracy"},
        }
    )
    assert song["id"] == "analyzed-song"
    lead_chords = [
        role["harmony"]["chord"]
        for section in song["sections"]
        for role in section["roles"]
        if role["id"] == "lead-vocal"
    ]
    assert C_MAJOR_LABEL in lead_chords


def test_render_helpers_reject_non_positive_inputs() -> None:
    """Fixture helpers must refuse empty or reversed generation parameters."""
    with pytest.raises(ValueError, match="duration_seconds"):
        render_c_major_triad(duration_seconds=0)
    with pytest.raises(ValueError, match="sample_rate"):
        render_c_major_triad(sample_rate=0)
    with pytest.raises(ValueError, match="must be positive"):
        render_click_track(bpm=0)
    with pytest.raises(ValueError, match="sample_rate"):
        write_pcm_wav(Path("unused.wav"), np.zeros(4, dtype=np.float32), 0)


def test_click_track_with_zero_length_click_stays_silent() -> None:
    """A 1 Hz sample rate makes the click window empty and leaves silence."""
    audio = render_click_track(bpm=60.0, duration_seconds=1.0, sample_rate=1)
    assert audio.shape == (1,)
    assert float(audio[0]) == 0.0


def test_duration_weighted_recall_covers_overlap_and_misses() -> None:
    """Recall must count only overlapping time that matches the expected chord."""
    assert duration_weighted_chord_recall([(0.0, 2.0, "C"), (2.0, 4.0, "G")], "C", 0.0, 4.0) == 0.5
    assert duration_weighted_chord_recall([(5.0, 6.0, "C")], "C", 0.0, 2.0) == 0.0
    with pytest.raises(ValueError, match="end_seconds"):
        duration_weighted_chord_recall([], "C", 1.0, 1.0)


def test_tempo_acc1_window_and_guards() -> None:
    """Acc1 must accept a 4% window and reject octave errors and bad inputs."""
    assert tempo_acc1(120.0, 120.0) is True
    assert tempo_acc1(124.8, 120.0) is True
    assert tempo_acc1(240.0, 120.0) is False
    with pytest.raises(ValueError, match="true_bpm"):
        tempo_acc1(120.0, 0.0)
    with pytest.raises(ValueError, match="relative_tolerance"):
        tempo_acc1(120.0, 120.0, relative_tolerance=-0.01)


def test_parse_case_report_rejects_malformed_payloads() -> None:
    """Manifest parsing must fail closed on missing or mistyped fields."""
    valid = build_case_report(
        case_id="c-major-triad",
        audio_sha256="a" * 64,
        metric_name="duration_weighted_chord_recall",
        metric_value=0.9,
        passed=True,
        true_label="C",
        engine_version="0.1.3",
    )
    assert parse_case_report(valid)["passed"] is True

    with pytest.raises(ValueError, match="must be an object"):
        parse_case_report(["not", "an", "object"])
    with pytest.raises(ValueError, match="missing"):
        parse_case_report({"case_id": "only"})
    with pytest.raises(ValueError, match="case_id"):
        parse_case_report({**valid, "case_id": ""})
    with pytest.raises(ValueError, match="audio_sha256"):
        parse_case_report({**valid, "audio_sha256": "short"})
    with pytest.raises(ValueError, match="metric_name"):
        parse_case_report({**valid, "metric_name": ""})
    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": True})
    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": "0.9"})
    with pytest.raises(ValueError, match="passed"):
        parse_case_report({**valid, "passed": 1})
    with pytest.raises(ValueError, match="engine_version"):
        parse_case_report({**valid, "engine_version": ""})
    with pytest.raises(ValueError, match="true_label"):
        parse_case_report({**valid, "true_label": ""})


def test_read_product_version_uses_version_file_or_unknown(tmp_path: Path) -> None:
    """Version lookup must read VERSION and fall back to unknown."""
    versioned = tmp_path / "versioned"
    versioned.mkdir()
    (versioned / "VERSION").write_text("9.9.9\n", encoding="utf-8")
    assert read_product_version(versioned) == "9.9.9"
    assert read_product_version(versioned / "VERSION") == "9.9.9"
    empty = tmp_path / "empty-tree"
    empty.mkdir()
    (empty / "VERSION").write_text("   \n", encoding="utf-8")
    assert read_product_version(empty) == "unknown"
    assert read_product_version() != "unknown"
