"""Tests for the bass transcription API.

These exercise the real pitch tracker against synthesised tones with known
fundamentals, so a passing test genuinely reflects transcription accuracy
(the previous "golden F1" test only passed because the code returned a fixed
dummy sequence).
"""

import io

import numpy as np
import soundfile as sf

from bandscope_analysis.transcription import api
from bandscope_analysis.transcription.api import NoteEvent, transcribe_bass_stem

_SR = 22050


def _tone_bytes(segments: list[tuple[float, float]], sr: int = _SR) -> bytes:
    """Render (frequency_hz, duration_s) segments to WAV bytes."""
    parts = []
    for freq, dur in segments:
        t = np.arange(int(dur * sr)) / sr
        parts.append(0.6 * np.sin(2.0 * np.pi * freq * t))
    signal = np.concatenate(parts).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, signal, sr, format="WAV")
    return buf.getvalue()


def _dominant_pitches(events: list[NoteEvent], n: int) -> list[str]:
    """Pitches of the ``n`` longest notes, returned in time order."""
    longest = sorted(events, key=lambda e: e.duration, reverse=True)[:n]
    return [e.pitch for e in sorted(longest, key=lambda e: e.start_time)]


def test_transcribe_bass_stem_empty():
    """Empty input returns an empty list."""
    assert transcribe_bass_stem(b"") == []


def test_transcribe_bass_stem_invalid_audio():
    """Undecodable bytes fail safely and return an empty list."""
    assert transcribe_bass_stem(b"dummy_audio_data") == []


def test_transcribe_bass_stem_returns_note_events():
    """A valid bass tone yields NoteEvents carrying the expected fields."""
    events = transcribe_bass_stem(_tone_bytes([(82.41, 1.0)]))  # E2
    assert isinstance(events, list)
    assert len(events) > 0
    assert all(isinstance(e, NoteEvent) for e in events)
    assert all(e.duration > 0 and e.start_time >= 0 for e in events)


def test_detects_single_bass_pitch():
    """A steady E2 tone is transcribed as E2 (real pitch, not a fixed dummy)."""
    events = transcribe_bass_stem(_tone_bytes([(82.41, 1.2)]))  # E2 = MIDI 40
    assert _dominant_pitches(events, 1) == ["E2"]


def test_detects_bass_note_sequence_in_order():
    """A two-note bass line (E2 -> A2) is transcribed with both pitches in order."""
    events = transcribe_bass_stem(_tone_bytes([(82.41, 0.7), (110.0, 0.7)]))  # E2, A2
    assert _dominant_pitches(events, 2) == ["E2", "A2"]


def test_transcription_pitch_accuracy_on_known_line():
    """The dominant notes of a known 3-note bass line match ground truth exactly.

    This replaces the former fabricated F1 test, whose 0.96 score was hardcoded
    to the dummy output.
    """
    ground_truth = ["E2", "G2", "A2"]  # 82.41, 98.00, 110.00 Hz
    events = transcribe_bass_stem(
        _tone_bytes([(82.41, 0.6), (98.00, 0.6), (110.0, 0.6)])
    )
    detected = _dominant_pitches(events, len(ground_truth))
    correct = sum(d == g for d, g in zip(detected, ground_truth, strict=False))
    accuracy = correct / len(ground_truth)
    assert accuracy == 1.0, f"pitch accuracy {accuracy}: got {detected}, want {ground_truth}"


def test_stereo_input_is_downmixed():
    """A stereo bass tone is downmixed to mono and still transcribed."""
    t = np.arange(int(1.0 * _SR)) / _SR
    mono = 0.6 * np.sin(2.0 * np.pi * 82.41 * t)  # E2
    stereo = np.stack([mono, mono], axis=1).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, stereo, _SR, format="WAV")
    assert _dominant_pitches(transcribe_bass_stem(buf.getvalue()), 1) == ["E2"]


def test_zero_length_audio_returns_empty():
    """A valid but empty WAV decodes to no samples and returns []."""
    buf = io.BytesIO()
    sf.write(buf, np.zeros(0, dtype=np.float32), _SR, format="WAV")
    assert transcribe_bass_stem(buf.getvalue()) == []


def test_audio_is_truncated_to_max_duration(monkeypatch):
    """Audio longer than the bound is truncated before pitch tracking."""
    captured = {}

    def fake_pyin(y, **kwargs):
        captured["n"] = len(y)
        empty = np.full(1, np.nan)
        return empty, np.zeros(1, dtype=bool), empty

    monkeypatch.setattr(api, "_MAX_DURATION_S", 0.5)
    monkeypatch.setattr(api.librosa, "pyin", fake_pyin)
    transcribe_bass_stem(_tone_bytes([(82.41, 2.0)]))  # 2s > 0.5s bound
    assert captured["n"] == int(0.5 * _SR)


def test_pyin_failure_returns_empty(monkeypatch):
    """A failure inside the pitch tracker fails safely and returns []."""
    def boom(*args, **kwargs):
        raise RuntimeError("pyin exploded")

    monkeypatch.setattr(api.librosa, "pyin", boom)
    assert transcribe_bass_stem(_tone_bytes([(82.41, 1.0)])) == []
