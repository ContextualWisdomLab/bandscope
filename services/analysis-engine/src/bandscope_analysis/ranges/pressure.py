"""Vocal range-pressure (tessitura strain) analysis over pitch-track arrays.

Quantifies how hard a vocal part pushes against the singer's range limits,
as required by the rehearsal domain model. Operates on the per-frame pitch
arrays produced by pYIN (see :mod:`bandscope_analysis.ranges.pitch_tracker`).

Pressure thresholds (documented contract):

- ``"high"``: ``time_in_top_range`` > 0.25 or
  ``longest_high_sustain_seconds`` > 4.0.
- ``"medium"``: ``time_in_top_range`` > 0.10 or
  ``longest_high_sustain_seconds`` > 2.0.
- ``"low"``: otherwise.

The "top range" is the zone within 3 semitones of the highest observed
(rounded) MIDI pitch. ``time_in_top_range`` is the fraction of voiced frames
falling in that zone (frames are assumed uniformly spaced, so frame fraction
equals time fraction).

Security Notes:
- Operates on in-memory numpy arrays only; no file I/O, network access,
  or shell execution.
- Bounded computation: all work is linear in the number of input frames.
- Safe failure: malformed, empty, or fully-unvoiced input yields a neutral
  default result. No exceptions escape the public functions.
- Unexpected failures log only the operation and exception class; dependency
  messages and traceback payloads stay out of routine logs.
"""

import logging
from typing import Literal, TypedDict

import librosa
import numpy as np

logger = logging.getLogger(__name__)

# Zone size (in semitones below the observed maximum) treated as "top range".
_TOP_ZONE_SEMITONES = 3

# Pressure thresholds; see module docstring.
_HIGH_TIME_FRACTION = 0.25
_HIGH_SUSTAIN_SECONDS = 4.0
_MEDIUM_TIME_FRACTION = 0.10
_MEDIUM_SUSTAIN_SECONDS = 2.0


class RangePressureResult(TypedDict):
    """JSON-serializable summary of range pressure for a vocal part."""

    range_semitones: int
    tessitura_center: str
    time_in_top_range: float
    longest_high_sustain_seconds: float
    pressure_level: Literal["low", "medium", "high"]


def _empty_result() -> RangePressureResult:
    """Return the neutral default used for empty or unusable input."""
    return {
        "range_semitones": 0,
        "tessitura_center": "",
        "time_in_top_range": 0.0,
        "longest_high_sustain_seconds": 0.0,
        "pressure_level": "low",
    }


def _classify_pressure(
    time_in_top_range: float, longest_high_sustain_seconds: float
) -> Literal["low", "medium", "high"]:
    """Map top-range dwell time and sustain length to a pressure level.

    Args:
        time_in_top_range: Fraction of voiced time in the top-3-semitone zone.
        longest_high_sustain_seconds: Longest continuous high-zone run.

    Returns:
        ``"high"``, ``"medium"``, or ``"low"`` per the documented thresholds.
    """
    if (
        time_in_top_range > _HIGH_TIME_FRACTION
        or longest_high_sustain_seconds > _HIGH_SUSTAIN_SECONDS
    ):
        return "high"
    if (
        time_in_top_range > _MEDIUM_TIME_FRACTION
        or longest_high_sustain_seconds > _MEDIUM_SUSTAIN_SECONDS
    ):
        return "medium"
    return "low"


def _longest_run_seconds(high: np.ndarray, times: np.ndarray) -> float:
    """Measure the longest continuous run of ``True`` frames, in seconds.

    A run's duration spans from its first frame time to its last frame time
    plus one frame period (estimated from the median frame spacing), so a
    single-frame run counts as one frame period.

    Args:
        high: Boolean array marking frames inside the high zone. Must contain
            at least one ``True`` (the caller guarantees this: the frame
            holding the observed maximum pitch is always inside the zone).
        times: Frame times in seconds, aligned with ``high``.

    Returns:
        Duration in seconds of the longest run.
    """
    padded = np.concatenate(([False], high, [False]))
    edges = np.flatnonzero(np.diff(padded.astype(np.int8)))
    starts, ends = edges[0::2], edges[1::2]
    frame_period = float(np.median(np.diff(times))) if times.size > 1 else 0.0
    durations = times[ends - 1] - times[starts] + frame_period
    return float(np.max(durations))


def _analyze(f0_hz: np.ndarray, voiced_flag: np.ndarray, times: np.ndarray) -> RangePressureResult:
    """Compute range-pressure metrics; may raise on malformed input.

    Args:
        f0_hz: Per-frame fundamental frequency in Hz (NaN where unvoiced).
        voiced_flag: Per-frame boolean voiced/unvoiced decisions.
        times: Per-frame times in seconds.

    Returns:
        The computed :class:`RangePressureResult`.
    """
    f0 = np.asarray(f0_hz, dtype=float)
    voiced = np.asarray(voiced_flag, dtype=bool)
    t = np.asarray(times, dtype=float)
    if not (f0.shape == voiced.shape == t.shape):
        raise ValueError("f0_hz, voiced_flag, and times must have matching shapes")

    valid = voiced & np.isfinite(f0) & (f0 > 0)
    if not bool(np.any(valid)):
        return _empty_result()

    midi = np.full(f0.shape, np.nan)
    midi[valid] = librosa.hz_to_midi(f0[valid])
    midi_rounded = np.round(midi)

    max_midi = int(np.max(midi_rounded[valid]))
    min_midi = int(np.min(midi_rounded[valid]))
    range_semitones = max_midi - min_midi

    median_midi = int(round(float(np.median(midi[valid]))))
    tessitura_center = str(librosa.midi_to_note(median_midi)).replace("♯", "#")

    in_top = valid & (midi_rounded >= max_midi - _TOP_ZONE_SEMITONES)
    time_in_top_range = float(np.sum(in_top) / np.sum(valid))
    longest_high_sustain_seconds = _longest_run_seconds(in_top, t)

    return {
        "range_semitones": range_semitones,
        "tessitura_center": tessitura_center,
        "time_in_top_range": time_in_top_range,
        "longest_high_sustain_seconds": longest_high_sustain_seconds,
        "pressure_level": _classify_pressure(time_in_top_range, longest_high_sustain_seconds),
    }


def analyze_range_pressure(
    f0_hz: np.ndarray, voiced_flag: np.ndarray, times: np.ndarray
) -> RangePressureResult:
    """Analyze how hard a vocal part presses against its range limits.

    Voiced frames with a finite, positive f0 are converted to MIDI pitch;
    the metrics below are computed over those frames only.

    Args:
        f0_hz: Per-frame fundamental frequency in Hz (NaN where unvoiced),
            as produced by ``librosa.pyin``.
        voiced_flag: Per-frame boolean voiced/unvoiced decisions.
        times: Per-frame times in seconds (e.g. from ``librosa.times_like``).

    Returns:
        A JSON-serializable dict with ``range_semitones`` (total span in
        semitones), ``tessitura_center`` (median pitch as a note name such
        as ``"A4"``), ``time_in_top_range`` (fraction of voiced time within
        the top 3 semitones of the observed range),
        ``longest_high_sustain_seconds`` (longest continuous voiced run in
        that zone), and ``pressure_level`` (``"low"``/``"medium"``/``"high"``
        per the thresholds in the module docstring). Empty or fully-unvoiced
        input yields the neutral default result; no exceptions escape.
    """
    try:
        return _analyze(f0_hz, voiced_flag, times)
    except Exception as error:
        logger.warning(
            "Range-pressure analysis failed; returning default: %s",
            type(error).__name__,
        )
        return _empty_result()


def analyze_range_pressure_from_audio(audio: np.ndarray, sr: int = 22050) -> RangePressureResult:
    """Analyze range pressure directly from an audio array.

    Convenience wrapper that runs ``librosa.pyin`` with the same settings as
    :class:`bandscope_analysis.ranges.pitch_tracker.PitchTracker` and
    delegates to :func:`analyze_range_pressure`.

    Args:
        audio: Audio time series.
        sr: Sampling rate.

    Returns:
        The same :class:`RangePressureResult` as
        :func:`analyze_range_pressure`; empty audio or a pYIN failure yields
        the neutral default result.
    """
    if len(audio) == 0:
        return _empty_result()

    fmin = float(librosa.note_to_hz("C1"))
    fmax = float(librosa.note_to_hz("C8"))
    try:
        f0, voiced_flag, _voiced_probs = librosa.pyin(audio, fmin=fmin, fmax=fmax, sr=sr)
    except librosa.util.exceptions.ParameterError as error:
        logger.warning(
            "pYIN failed during range-pressure analysis: %s",
            type(error).__name__,
        )
        return _empty_result()

    times = librosa.times_like(f0, sr=sr)
    return analyze_range_pressure(f0, voiced_flag, times)
