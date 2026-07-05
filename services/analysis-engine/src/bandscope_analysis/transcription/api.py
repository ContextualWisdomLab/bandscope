"""Transcription API — monophonic bass transcription via probabilistic YIN.

Replaces the previous fixed-dummy stub with a real pitch tracker (``librosa.pyin``)
so that the transcribed notes reflect the actual audio instead of a hardcoded
sequence. Bass lines are effectively monophonic, which is exactly the case YIN
handles well; polyphonic transcription remains future work (Basic Pitch / CREPE).
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import librosa
import numpy as np
import soundfile as sf  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

_NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

# Bass band: E1 (~41 Hz) up to ~E4. Bounds pyin search and keeps MIDI in range.
_FMIN_HZ = 41.0
_FMAX_HZ = 330.0
_FRAME_LENGTH = 2048
_HOP_LENGTH = 512
# Notes shorter than this are treated as transients/noise, not rehearsal-relevant.
_MIN_NOTE_DURATION_S = 0.08
# Bound processed audio so untrusted input cannot force unbounded computation.
_MAX_DURATION_S = 600.0


@dataclass
class NoteEvent:
    """Represents a transcribed musical note."""

    pitch: str
    start_time: float
    duration: float


def _hz_to_midi(freq: float) -> int:
    """Convert a frequency in Hz to the nearest MIDI note number."""
    return int(round(69.0 + 12.0 * np.log2(freq / 440.0)))


def _midi_to_name(midi: int) -> str:
    """Convert a MIDI note number to scientific pitch notation (e.g. 28 -> 'E1')."""
    return f"{_NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _decode(stem_data: bytes) -> Optional[Tuple[np.ndarray, int]]:
    """Decode untrusted audio bytes to a bounded mono float32 signal and sample rate.

    Returns ``None`` on any decode failure or empty/invalid audio.
    """
    try:
        y, sr = sf.read(io.BytesIO(stem_data), dtype="float32", always_2d=False)
    except Exception:
        return None
    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if y.size == 0 or sr <= 0:
        return None
    max_samples = int(_MAX_DURATION_S * sr)
    if y.size > max_samples:
        y = y[:max_samples]
    return y, int(sr)


def _segment_notes(
    f0: np.ndarray, voiced_flag: np.ndarray, times: np.ndarray
) -> List[NoteEvent]:
    """Group consecutive voiced frames of the same pitch into note events."""
    events: List[NoteEvent] = []
    frame_dt = float(times[1] - times[0]) if len(times) > 1 else 0.0
    cur_midi: Optional[int] = None
    start_t = 0.0
    last_t = 0.0

    def flush(end_t: float) -> None:
        nonlocal cur_midi
        if cur_midi is not None and (end_t - start_t) >= _MIN_NOTE_DURATION_S:
            events.append(
                NoteEvent(
                    pitch=_midi_to_name(cur_midi),
                    start_time=round(start_t, 3),
                    duration=round(end_t - start_t, 3),
                )
            )
        cur_midi = None

    for freq, voiced, t in zip(f0, voiced_flag, times, strict=False):
        is_voiced = bool(voiced) and np.isfinite(freq) and freq > 0
        midi = _hz_to_midi(float(freq)) if is_voiced else None
        if midi != cur_midi:
            flush(float(t))
            if midi is not None:
                cur_midi = midi
                start_t = float(t)
        last_t = float(t)
    flush(last_t + frame_dt)
    return events


def transcribe_bass_stem(stem_data: bytes) -> List[NoteEvent]:
    """Transcribe a monophonic bass stem into a list of :class:`NoteEvent`.

    Estimates the fundamental frequency per frame with probabilistic YIN
    (``librosa.pyin``) inside the bass band, then segments consecutive voiced
    frames of the same pitch into notes. The output reflects the actual audio.

    Security Notes:
    - ``stem_data`` is untrusted binary audio, decoded via soundfile and never
      executed. No file, network, or shell access.
    - Bounded computation: audio is truncated to ``_MAX_DURATION_S`` and the
      pitch search is confined to the bass band.
    - Safe failure: empty, undecodable, or degenerate input returns ``[]``.

    Args:
        stem_data: Binary data representing the audio stem.

    Returns:
        List of :class:`NoteEvent` in time order (may be empty).
    """
    if not stem_data:
        return []
    decoded = _decode(stem_data)
    if decoded is None:
        return []
    y, sr = decoded
    try:
        f0, voiced_flag, _ = librosa.pyin(
            y,
            sr=sr,
            fmin=_FMIN_HZ,
            fmax=_FMAX_HZ,
            frame_length=_FRAME_LENGTH,
            hop_length=_HOP_LENGTH,
        )
    except Exception:
        logger.warning("pyin pitch tracking failed on bass stem", exc_info=True)
        return []
    times = librosa.times_like(f0, sr=sr, hop_length=_HOP_LENGTH)
    return _segment_notes(f0, voiced_flag, times)
