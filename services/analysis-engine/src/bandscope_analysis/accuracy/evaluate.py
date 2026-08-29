"""Score decoded PCM fixtures through production analysis helpers."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterator

import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.accuracy.fixtures import (
    C_MAJOR_LABEL,
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    read_pcm_wav,
    read_verified_fixture_bytes,
)
from bandscope_analysis.accuracy.manifest import AccuracyCaseReport, build_case_report
from bandscope_analysis.accuracy.metrics import duration_weighted_chord_recall, tempo_acc1
from bandscope_analysis.accuracy.numeric import is_finite_real
from bandscope_analysis.chords.chord_recognizer import ChordRecognizer
from bandscope_analysis.temporal.analyzer import TemporalAnalyzer

C_MAJOR_RECALL_FLOOR = 0.70


@contextmanager
def _verified_fixture_path(audio_path: Path, expected_sha256: str) -> Iterator[Path]:
    """Stage the exact checksum-verified bytes at an app-owned temporary path."""
    payload = read_verified_fixture_bytes(audio_path, expected_sha256)
    with TemporaryDirectory(prefix="bandscope-accuracy-") as temp_dir:
        verified_path = Path(temp_dir) / "verified.wav"
        verified_path.write_bytes(payload)
        yield verified_path


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
    if not is_finite_real(sample_rate) or sample_rate <= 0:
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
    """Checksum, decode, and score one immutable C major WAV snapshot.

    Args:
        audio_path: On-disk WAV written by ``write_pcm_wav``.
        expected_sha256: Registered digest. Mismatch fails closed before decode.

    Returns:
        A case report whose metric is duration-weighted recall of ``C``.
    """
    with _verified_fixture_path(audio_path, expected_sha256) as verified_path:
        audio, sample_rate = read_pcm_wav(verified_path)
    return evaluate_c_major_pcm(audio, sample_rate, expected_sha256)


def evaluate_click_tempo_file(
    audio_path: Path,
    expected_sha256: str,
    true_bpm: float = DEFAULT_CLICK_BPM,
) -> AccuracyCaseReport:
    """Score one immutable checksum-verified click-track WAV snapshot.

    Args:
        audio_path: On-disk WAV written by ``write_pcm_wav``.
        expected_sha256: Registered digest. Mismatch fails closed.
        true_bpm: Known click tempo.

    Returns:
        A case report whose metric is 1.0 on Acc1 pass and 0.0 on Acc1 fail.
    """
    with _verified_fixture_path(audio_path, expected_sha256) as verified_path:
        features = TemporalAnalyzer().analyze(verified_path)
    passed = tempo_acc1(features["bpm"], true_bpm)
    return build_case_report(
        case_id=f"click-{true_bpm:g}-bpm",
        audio_sha256=expected_sha256,
        metric_name="tempo_acc1",
        metric_value=1.0 if passed else 0.0,
        passed=passed,
        true_label=f"{true_bpm:g} bpm",
    )
