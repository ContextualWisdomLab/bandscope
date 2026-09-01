"""Regressions for the licensed demo structural-analysis contract."""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np

from bandscope_analysis.sections.segmenter import MIN_SEGMENT_DURATION_SECONDS, segment_audio

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_RESOURCE_ROOT = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "resources" / "demo"
DEMO_AUDIO_PATH = DEMO_RESOURCE_ROOT / "late-night-set.wav"
DEMO_ANNOTATION_PATH = DEMO_RESOURCE_ROOT / "annotations.json"


def _read_demo_audio(audio_path: Path = DEMO_AUDIO_PATH) -> tuple[np.ndarray, int, float]:
    """Decode one mono PCM demo fixture through the stdlib WAV reader."""
    with wave.open(str(audio_path), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        declared_frame_count = wav_file.getnframes()
        assert wav_file.getnchannels() == 1
        assert wav_file.getsampwidth() == 2
        decoded_frame_bytes = wav_file.readframes(declared_frame_count)
        audio_samples = np.frombuffer(decoded_frame_bytes, dtype="<i2").astype(np.float32) / 32768.0
    decoded_frame_count = int(audio_samples.size)
    return audio_samples, sample_rate, decoded_frame_count / sample_rate


def test_demo_duration_uses_decoded_frame_count(tmp_path: Path) -> None:
    """Reject duration authority from a WAV header when the payload is truncated."""
    truncated_audio_path = tmp_path / "truncated-demo.wav"
    with wave.open(str(truncated_audio_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(10)
        wav_file.writeframes(b"\x00\x00" * 100)

    complete_audio_bytes = truncated_audio_path.read_bytes()
    truncated_audio_path.write_bytes(complete_audio_bytes[:-20])

    audio_samples, sample_rate, duration_seconds = _read_demo_audio(truncated_audio_path)
    assert audio_samples.size == 90
    assert duration_seconds == audio_samples.size / sample_rate


def test_licensed_demo_spans_two_structural_windows() -> None:
    """Keep the bundled demo long enough to avoid the short-audio fallback."""
    _audio_samples, _sample_rate, duration_seconds = _read_demo_audio()
    assert duration_seconds >= MIN_SEGMENT_DURATION_SECONDS * 2

    annotation_document = json.loads(DEMO_ANNOTATION_PATH.read_text(encoding="utf-8"))
    section_ranges = [section["timeRange"] for section in annotation_document["sections"]]
    assert section_ranges == [{"start": 0, "end": 5}, {"start": 5, "end": 10}]
    assert all(
        section_range["end"] - section_range["start"] >= MIN_SEGMENT_DURATION_SECONDS
        for section_range in section_ranges
    )


def test_licensed_demo_reaches_structural_segmentation() -> None:
    """Prove the source fixture itself yields multiple structural candidates."""
    audio_samples, sample_rate, duration_seconds = _read_demo_audio()
    detected_sections = segment_audio(audio_samples, sample_rate, duration_seconds)
    assert len(detected_sections) >= 2
    assert all(
        "Audio too short for structural analysis" not in section["confidence_notes"]
        for section in detected_sections
    )
