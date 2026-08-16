"""Score decoded PCM fixtures through production analysis helpers."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.accuracy.fixtures import (
    C_MAJOR_LABEL,
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    assert_fixture_checksum,
    read_pcm_wav,
)
from bandscope_analysis.accuracy.manifest import AccuracyCaseReport, build_case_report
from bandscope_analysis.accuracy.metrics import duration_weighted_chord_recall, tempo_acc1
from bandscope_analysis.chords.chord_recognizer import ChordRecognizer
from bandscope_analysis.temporal.analyzer import TemporalAnalyzer

C_MAJOR_RECALL_FLOOR = 0.70


def evaluate_c_major_pcm(
    audio: NDArray[np.floating],
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    audio_sha256: str = "0" * 64,
) -> AccuracyCaseReport:
    """Score a C major triad through the production chord recognizer.

    Args:
        audio: Decoded one-dimensional non-empty finite floating-point mono PCM.
            Do not pass a chroma matrix, integer payload, or unresolved
            multichannel buffer.
        sample_rate: Finite positive non-Boolean sample rate of ``audio``.
        audio_sha256: Digest of the on-disk fixture that produced ``audio``.

    Returns:
        A case report whose metric is duration-weighted recall of ``C``.

    Raises:
        ValueError: If PCM is empty, non-floating, non-finite, not mono, or the
            sample-rate evidence is Boolean, non-finite, or non-positive.
    """
    if isinstance(sample_rate, bool) or not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("sample_rate must be a finite positive non-Boolean number")
    if (
        not isinstance(audio, np.ndarray)
        or audio.ndim != 1
        or audio.size == 0
        or not np.issubdtype(audio.dtype, np.floating)
        or not np.isfinite(audio).all()
    ):
        raise ValueError("audio must be non-empty finite floating-point mono PCM")
    samples = np.asarray(audio, dtype=np.float32)

    recognizer = ChordRecognizer()
    tracked = recognizer.recognize(samples, sr=sample_rate)
    segments = [(item["start_time"], item["end_time"], item["chord"]) for item in tracked]
    duration = float(len(samples) / sample_rate)
    recall = duration_weighted_chord_recall(segments, C_MAJOR_LABEL, 0.0, duration)
    return build_case_report(
        case_id="c-major-triad",
        audio_sha256=audio_sha256,
        metric_name="duration_weighted_chord_recall",
        metric_value=recall,
        passed=recall >= C_MAJOR_RECALL_FLOOR,
        true_label=C_MAJOR_LABEL,
    )


def evaluate_c_major_file(audio_path: Path, expected_sha256: str) -> AccuracyCaseReport:
    """Checksum, decode, and score a C major WAV through ChordRecognizer.

    Args:
        audio_path: On-disk WAV written by ``write_pcm_wav``.
        expected_sha256: Registered digest. Mismatch fails closed before decode.

    Returns:
        A case report whose metric is duration-weighted recall of ``C``.
    """
    assert_fixture_checksum(audio_path, expected_sha256)
    audio, sample_rate = read_pcm_wav(audio_path)
    return evaluate_c_major_pcm(audio, sample_rate, expected_sha256)


def evaluate_click_tempo_file(
    audio_path: Path,
    expected_sha256: str,
    true_bpm: float = DEFAULT_CLICK_BPM,
) -> AccuracyCaseReport:
    """Decode a click-track WAV with TemporalAnalyzer and score Acc1.

    Args:
        audio_path: On-disk WAV written by ``write_pcm_wav``.
        expected_sha256: Registered digest. Mismatch fails closed.
        true_bpm: Known click tempo.

    Returns:
        A case report whose metric is 1.0 on Acc1 pass and 0.0 on Acc1 fail.
    """
    assert_fixture_checksum(audio_path, expected_sha256)
    features = TemporalAnalyzer().analyze(audio_path)
    passed = tempo_acc1(features["bpm"], true_bpm)
    return build_case_report(
        case_id="click-120-bpm",
        audio_sha256=expected_sha256,
        metric_name="tempo_acc1",
        metric_value=1.0 if passed else 0.0,
        passed=passed,
        true_label=f"{true_bpm:g} bpm",
    )
