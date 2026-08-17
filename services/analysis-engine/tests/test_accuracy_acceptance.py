"""Tier 1 deterministic real-audio accuracy acceptance tests."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import numpy as np
import pytest

from bandscope_analysis import VERSION
from bandscope_analysis.accuracy import (
    C_MAJOR_LABEL,
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    AccuracyCase,
    AccuracyMetric,
    AccuracyReport,
    AccuracyThreshold,
    assert_fixture_checksum,
    build_accuracy_report,
    duration_weighted_chord_recall,
    render_c_major_triad,
    render_click_track,
    run_c_major_acceptance,
    run_tempo_acceptance,
    tempo_acc1,
    write_pcm_wav,
)
from bandscope_analysis.chords import ChordRecognizer
from bandscope_analysis.temporal import TemporalAnalyzer


def test_accuracy_case_requires_sha256_digest() -> None:
    """Fixture manifests must pin their source bytes with a SHA-256 digest."""
    with pytest.raises(ValueError, match="sha256"):
        AccuracyCase(
            case_id="case-c-major",
            source_kind="generated",
            source_locator="generated://c-major",
            expected_label="C",
            duration_seconds=3.0,
            sha256="",
            license_id="CC0-1.0",
        )


def test_accuracy_case_rejects_boolean_duration() -> None:
    """Boolean duration evidence must not be accepted as a numeric value."""
    with pytest.raises(ValueError, match="duration_seconds"):
        AccuracyCase(
            case_id="case-c-major",
            source_kind="generated",
            source_locator="generated://c-major",
            expected_label="C",
            duration_seconds=cast(Any, True),
            sha256="a" * 64,
            license_id="CC0-1.0",
        )


def test_accuracy_case_requires_canonical_sha256_digest() -> None:
    """Fixture manifests must use one exact lowercase SHA-256 representation."""
    common = dict(
        case_id="case-c-major",
        source_kind="generated",
        source_locator="generated://c-major",
        expected_label="C",
        duration_seconds=3.0,
        license_id="CC0-1.0",
    )
    for digest in ["g" * 64, "A" * 64, "a" * 63, "a" * 65]:
        with pytest.raises(ValueError, match="sha256"):
            AccuracyCase(sha256=digest, **common)


def test_accuracy_metric_rejects_boolean_values() -> None:
    """Boolean values must not satisfy numeric accuracy evidence contracts."""
    with pytest.raises(ValueError, match="value"):
        AccuracyMetric(name="metric", value=cast(Any, True), threshold=0.5, passed=True)
    with pytest.raises(ValueError, match="threshold"):
        AccuracyMetric(name="metric", value=0.5, threshold=cast(Any, False), passed=True)


def test_accuracy_metric_rejects_non_finite_values() -> None:
    """Non-finite metrics must not become buyer-facing acceptance evidence."""
    for value in [np.nan, np.inf, -np.inf]:
        with pytest.raises(ValueError, match="value"):
            AccuracyMetric(name="metric", value=float(value), threshold=0.5, passed=False)
    for threshold in [np.nan, np.inf, -np.inf]:
        with pytest.raises(ValueError, match="threshold"):
            AccuracyMetric(name="metric", value=0.5, threshold=float(threshold), passed=False)


def test_accuracy_report_requires_exact_product_version() -> None:
    """Accuracy reports must carry exact non-empty BandScope version provenance."""
    metric = AccuracyMetric(name="metric", value=1.0, threshold=0.5, passed=True)
    with pytest.raises(ValueError, match="product_version"):
        AccuracyReport(product_version="", metrics=(metric,))
    with pytest.raises(ValueError, match="product_version"):
        AccuracyReport(product_version=" stale ", metrics=(metric,))


def test_build_accuracy_report_preserves_product_version() -> None:
    """The report builder must stamp the exact running product version."""
    report = build_accuracy_report(
        [AccuracyMetric(name="metric", value=1.0, threshold=0.5, passed=True)]
    )
    assert report.product_version == VERSION


def test_write_and_verify_fixture_checksum(tmp_path: Path) -> None:
    """The on-disk bytes scored by acceptance must match the pinned digest."""
    audio = render_c_major_triad(duration_seconds=0.1)
    path = tmp_path / "c-major.wav"
    digest = write_pcm_wav(path, audio, DEFAULT_SAMPLE_RATE)
    assert_fixture_checksum(path, digest)
    path.write_bytes(path.read_bytes() + b"tamper")
    with pytest.raises(ValueError, match="checksum"):
        assert_fixture_checksum(path, digest)


def test_render_helpers_reject_invalid_inputs() -> None:
    """Fixture generation must fail before invalid values reach DSP allocation."""
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
    """Overlapping matching intervals must not double-count annotated time."""
    estimates = [(0.0, 2.0, "C"), (1.0, 3.0, "C")]
    assert duration_weighted_chord_recall(estimates, "C", 0.0, 3.0) == 1.0


def test_duration_weighted_recall_rejects_boolean_and_non_finite_timing() -> None:
    """Malformed interval evidence must fail closed instead of entering arithmetic."""
    malformed_estimates: list[list[Any]] = [
        [True, 1.0, "C"],
        [0.0, False, "C"],
        [0.0, np.nan, "C"],
        [0.0, np.inf, "C"],
        [2.0, 1.0, "C"],
    ]
    for estimate in malformed_estimates:
        with pytest.raises(ValueError, match="interval"):
            duration_weighted_chord_recall(cast(Any, [estimate]), "C", 0.0, 3.0)

    for start_seconds, end_seconds in [
        (cast(Any, True), 3.0),
        (0.0, cast(Any, False)),
        (np.nan, 3.0),
        (0.0, np.inf),
    ]:
        with pytest.raises(ValueError, match="seconds"):
            duration_weighted_chord_recall([], "C", start_seconds, end_seconds)


def test_tempo_acc1_handles_threshold_and_miss() -> None:
    """Tempo acceptance uses the conventional percentage tolerance contract."""
    assert tempo_acc1(120.0, 120.0) == 1.0
    assert tempo_acc1(124.0, 120.0, tolerance=0.04) == 1.0
    assert tempo_acc1(126.0, 120.0, tolerance=0.04) == 0.0


def test_tempo_acc1_rejects_boolean_and_non_finite_inputs() -> None:
    """Malformed tempo evidence must fail before ratio arithmetic."""
    for estimated_bpm, truth_bpm, tolerance in [
        (cast(Any, True), 120.0, 0.04),
        (120.0, cast(Any, False), 0.04),
        (120.0, 120.0, cast(Any, True)),
        (np.nan, 120.0, 0.04),
        (120.0, np.inf, 0.04),
        (120.0, 120.0, np.nan),
    ]:
        with pytest.raises(ValueError):
            tempo_acc1(estimated_bpm, truth_bpm, tolerance=tolerance)


def test_c_major_acceptance_scores_production_recognizer(tmp_path: Path) -> None:
    """Tier 1 C-major acceptance must score decoded fixture bytes via production code."""
    report = run_c_major_acceptance(tmp_path)
    assert report.product_version == VERSION
    assert report.passed
    assert report.metrics[0].name == "c_major_duration_weighted_recall"
    assert report.metrics[0].value >= report.metrics[0].threshold


def test_tempo_acceptance_scores_production_temporal_analyzer(tmp_path: Path) -> None:
    """Tier 1 tempo acceptance must score decoded fixture bytes via production code."""
    report = run_tempo_acceptance(tmp_path)
    assert report.product_version == VERSION
    assert report.passed
    assert report.metrics[0].name == "tempo_acc1"
    assert report.metrics[0].value >= report.metrics[0].threshold


def test_c_major_file_decode_scores_disk_not_memory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Acceptance must analyze decoded on-disk bytes rather than the render buffer."""
    from bandscope_analysis.accuracy import evaluate as evaluate_module

    original_read = evaluate_module.read_pcm_wav

    def corrupt_decoded_audio(path: Path) -> tuple[np.ndarray[Any, Any], int]:
        decoded, sample_rate = original_read(path)
        return np.zeros_like(decoded), sample_rate

    monkeypatch.setattr(evaluate_module, "read_pcm_wav", corrupt_decoded_audio)
    report = run_c_major_acceptance(tmp_path)
    assert not report.passed


def test_acceptance_rejects_manifest_digest_mismatch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Acceptance must fail closed if the registered fixture digest drifts."""
    from bandscope_analysis.accuracy import evaluate as evaluate_module

    original_writer = evaluate_module.write_pcm_wav

    def wrong_digest(path: Path, audio: np.ndarray[Any, Any], sample_rate: int) -> str:
        original_writer(path, audio, sample_rate)
        return "0" * 64

    monkeypatch.setattr(evaluate_module, "write_pcm_wav", wrong_digest)
    with pytest.raises(ValueError, match="checksum"):
        run_c_major_acceptance(tmp_path)


def test_acceptance_report_json_is_machine_readable(tmp_path: Path) -> None:
    """Tier 1 evidence must serialize deterministically for CI artifact consumers."""
    report = run_tempo_acceptance(tmp_path)
    payload = json.loads(report.to_json())
    assert payload["productVersion"] == VERSION
    assert payload["passed"] is True
    assert payload["metrics"][0]["name"] == "tempo_acc1"


def test_metric_threshold_model_rejects_invalid_bounds() -> None:
    """Metric thresholds must remain finite and bounded to meaningful ranges."""
    with pytest.raises(ValueError, match="minimum"):
        AccuracyThreshold(metric_name="metric", minimum=np.nan)
    with pytest.raises(ValueError, match="minimum"):
        AccuracyThreshold(metric_name="metric", minimum=cast(Any, True))


def test_accuracy_evaluation_rejects_non_finite_metric_result(monkeypatch: pytest.MonkeyPatch) -> None:
    """Acceptance must reject non-finite analyzer outputs before building evidence."""
    from bandscope_analysis.accuracy import evaluate as evaluate_module

    fake_case = AccuracyCase(
        case_id="case",
        source_kind="generated",
        source_locator="generated://fixture",
        expected_label=C_MAJOR_LABEL,
        duration_seconds=1.0,
        sha256="a" * 64,
        license_id="CC0-1.0",
    )
    fake_recognizer = SimpleNamespace(analyze=lambda *_args, **_kwargs: np.nan)
    monkeypatch.setattr(evaluate_module, "ChordRecognizer", lambda: fake_recognizer)
    with pytest.raises(ValueError):
        evaluate_module.evaluate_c_major_case(fake_case, np.zeros(8, dtype=np.float32), 8)
