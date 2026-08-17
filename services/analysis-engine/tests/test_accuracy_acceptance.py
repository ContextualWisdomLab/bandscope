"""Real-audio accuracy acceptance for decoded PCM fixtures.

These cases prove a buyer-visible claim: a known waveform written to disk,
decoded, and analyzed yields the expected chord or tempo. Mocked chroma
matrices are not acceptance evidence.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from bandscope_analysis.accuracy import (
    C_MAJOR_LABEL,
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    build_case_report,
    duration_weighted_chord_recall,
    evaluate_c_major_file,
    evaluate_c_major_pcm,
    evaluate_click_tempo_file,
    parse_case_report,
    read_pcm_wav,
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
    path = tmp_path / "c-major.wav"
    digest = write_pcm_wav(path, audio, DEFAULT_SAMPLE_RATE)
    report = evaluate_c_major_file(path, digest)
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
    click = render_click_track()
    click_path = tmp_path / "click.wav"
    write_pcm_wav(click_path, click, DEFAULT_SAMPLE_RATE)
    with pytest.raises(ValueError, match="checksum mismatch"):
        evaluate_click_tempo_file(click_path, "0" * 64)

    triad = render_c_major_triad()
    triad_path = tmp_path / "c-major.wav"
    write_pcm_wav(triad_path, triad, DEFAULT_SAMPLE_RATE)
    with pytest.raises(ValueError, match="checksum mismatch"):
        evaluate_c_major_file(triad_path, "0" * 64)


def test_c_major_file_decode_scores_disk_not_memory(tmp_path: Path) -> None:
    """Silence on disk must fail even when a C major array exists in memory."""
    triad = render_c_major_triad(duration_seconds=3.0)
    silence = np.zeros_like(triad)
    path = tmp_path / "silence.wav"
    digest = write_pcm_wav(path, silence, DEFAULT_SAMPLE_RATE)
    report = evaluate_c_major_file(path, digest)
    assert report["passed"] is False
    assert report["metric_value"] < C_MAJOR_RECALL_FLOOR
    memory_report = evaluate_c_major_pcm(triad, DEFAULT_SAMPLE_RATE, digest)
    assert memory_report["passed"] is True


def test_read_pcm_wav_mixes_stereo_to_mono(tmp_path: Path) -> None:
    """A stereo fixture must collapse to mono before scoring."""
    path = tmp_path / "stereo.wav"
    stereo = np.column_stack([np.ones(8, dtype=np.float32), np.zeros(8, dtype=np.float32)])
    sf.write(path, stereo, DEFAULT_SAMPLE_RATE)
    audio, sample_rate = read_pcm_wav(path)
    assert sample_rate == DEFAULT_SAMPLE_RATE
    assert audio.shape == (8,)
    assert np.allclose(audio, 0.5, atol=1e-3)


def test_read_pcm_wav_rejects_empty_file(tmp_path: Path) -> None:
    """An empty WAV must fail closed instead of scoring as a pass."""
    path = tmp_path / "empty.wav"
    sf.write(path, np.zeros(0, dtype=np.float32), DEFAULT_SAMPLE_RATE)
    with pytest.raises(ValueError, match="no samples"):
        read_pcm_wav(path)


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


def test_render_helpers_reject_non_finite_inputs() -> None:
    """Fixture generation must reject non-finite timing before allocation/loops."""
    with pytest.raises(ValueError, match="duration_seconds.*finite"):
        render_c_major_triad(duration_seconds=np.nan)
    with pytest.raises(ValueError, match="bpm.*finite"):
        render_click_track(bpm=np.nan)
    with pytest.raises(ValueError, match="duration_seconds.*finite"):
        render_click_track(duration_seconds=np.inf)


def test_click_track_rejects_zero_length_click_evidence() -> None:
    """A sample rate that cannot represent one click sample must fail closed."""
    with pytest.raises(ValueError, match="click length"):
        render_click_track(bpm=60.0, duration_seconds=1.0, sample_rate=1)


def test_duration_weighted_recall_covers_overlap_and_misses() -> None:
    """Recall must count only overlapping time that matches the expected chord."""
    assert duration_weighted_chord_recall([(0.0, 2.0, "C"), (2.0, 4.0, "G")], "C", 0.0, 4.0) == 0.5
    assert duration_weighted_chord_recall([(5.0, 6.0, "C")], "C", 0.0, 2.0) == 0.0
    with pytest.raises(ValueError, match="end_seconds"):
        duration_weighted_chord_recall([], "C", 1.0, 1.0)


def test_duration_weighted_recall_unions_overlapping_matching_estimates() -> None:
    """Overlapping matching estimates must not count annotation time twice."""
    recall = duration_weighted_chord_recall(
        [(0.0, 2.0, "C"), (1.0, 3.0, "C"), (4.0, 5.0, "C")],
        "C",
        0.0,
        5.0,
    )
    assert recall == pytest.approx(0.8)


@pytest.mark.parametrize(
    ("segments", "start_seconds", "end_seconds"),
    [
        ([(np.nan, 2.0, "C")], 0.0, 4.0),
        ([(0.0, np.inf, "C")], 0.0, 4.0),
        ([(0.0, 2.0, "C")], np.nan, 4.0),
        ([(0.0, 2.0, "C")], 0.0, np.inf),
    ],
)
def test_duration_weighted_recall_rejects_non_finite_timing(
    segments: list[tuple[float, float, str]],
    start_seconds: float,
    end_seconds: float,
) -> None:
    """Non-finite estimate or annotation times must not fabricate recall."""
    with pytest.raises(ValueError, match="finite"):
        duration_weighted_chord_recall(segments, "C", start_seconds, end_seconds)


@pytest.mark.parametrize(
    ("segments", "start_seconds", "end_seconds"),
    [
        ([(True, 2.0, "C")], 0.0, 4.0),
        ([(0.0, True, "C")], 0.0, 4.0),
        ([(0.0, 2.0, "C")], False, 4.0),
        ([(0.0, 2.0, "C")], 0.0, True),
    ],
)
def test_duration_weighted_recall_rejects_boolean_timing_evidence(
    segments: list[tuple[float | bool, float | bool, str]],
    start_seconds: float | bool,
    end_seconds: float | bool,
) -> None:
    """Boolean timestamps must not be accepted as numeric MIR timing evidence."""
    with pytest.raises(ValueError, match="times must be finite numbers"):
        duration_weighted_chord_recall(segments, "C", start_seconds, end_seconds)  # type: ignore[arg-type]


def test_tempo_acc1_window_and_guards() -> None:
    """Acc1 must accept a 4% window and reject octave errors and bad inputs."""
    assert tempo_acc1(120.0, 120.0) is True
    assert tempo_acc1(124.8, 120.0) is True
    assert tempo_acc1(240.0, 120.0) is False
    with pytest.raises(ValueError, match="true_bpm"):
        tempo_acc1(120.0, 0.0)
    with pytest.raises(ValueError, match="relative_tolerance"):
        tempo_acc1(120.0, 120.0, relative_tolerance=-0.01)


@pytest.mark.parametrize(
    ("estimated_bpm", "true_bpm", "relative_tolerance", "message"),
    [
        (np.nan, 120.0, 0.04, "estimated_bpm"),
        (np.inf, 120.0, 0.04, "estimated_bpm"),
        (120.0, np.nan, 0.04, "true_bpm"),
        (120.0, np.inf, 0.04, "true_bpm"),
        (120.0, 120.0, np.nan, "relative_tolerance"),
        (120.0, 120.0, np.inf, "relative_tolerance"),
    ],
)
def test_tempo_acc1_rejects_non_finite_evidence(
    estimated_bpm: float,
    true_bpm: float,
    relative_tolerance: float,
    message: str,
) -> None:
    """Non-finite estimate, truth, or tolerance must fail closed."""
    with pytest.raises(ValueError, match=message):
        tempo_acc1(estimated_bpm, true_bpm, relative_tolerance)


@pytest.mark.parametrize(
    ("estimated_bpm", "true_bpm", "relative_tolerance", "message"),
    [
        (True, 120.0, 0.04, "estimated_bpm"),
        (120.0, True, 0.04, "true_bpm"),
        (120.0, 120.0, True, "relative_tolerance"),
    ],
)
def test_tempo_acc1_rejects_boolean_numeric_evidence(
    estimated_bpm: float | bool,
    true_bpm: float | bool,
    relative_tolerance: float | bool,
    message: str,
) -> None:
    """Boolean values must not satisfy numeric Acc1 evidence contracts."""
    with pytest.raises(ValueError, match=message):
        tempo_acc1(estimated_bpm, true_bpm, relative_tolerance)  # type: ignore[arg-type]


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
    with pytest.raises(ValueError, match="audio_sha256"):
        parse_case_report({**valid, "audio_sha256": "g" * 64})
    with pytest.raises(ValueError, match="metric_name"):
        parse_case_report({**valid, "metric_name": ""})
    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": True})
    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": "0.9"})
    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": np.nan})
    with pytest.raises(ValueError, match="metric_value"):
        parse_case_report({**valid, "metric_value": np.inf})
    with pytest.raises(ValueError, match="passed"):
        parse_case_report({**valid, "passed": 1})
    with pytest.raises(ValueError, match="engine_version"):
        parse_case_report({**valid, "engine_version": ""})
    with pytest.raises(ValueError, match="true_label"):
        parse_case_report({**valid, "true_label": ""})


def test_read_product_version_uses_version_file_and_fails_closed(tmp_path: Path) -> None:
    """Version lookup must read VERSION and reject missing provenance."""
    versioned = tmp_path / "versioned"
    versioned.mkdir()
    (versioned / "VERSION").write_text("9.9.9\n", encoding="utf-8")
    assert read_product_version(versioned) == "9.9.9"
    assert read_product_version(versioned / "VERSION") == "9.9.9"
    empty = tmp_path / "empty-tree"
    empty.mkdir()
    (empty / "VERSION").write_text("   \n", encoding="utf-8")
    with pytest.raises(ValueError, match="VERSION"):
        read_product_version(empty)
    assert read_product_version() != "unknown"
