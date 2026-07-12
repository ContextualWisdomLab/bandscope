"""Groove/feel detection (straight vs swing) for the temporal analysis engine.

This module estimates whether a performance is played with a *straight* feel
(even eighth notes, off-beats near the midpoint of the beat) or a *swing* feel
(triplet-based, off-beats pushed toward the two-thirds point, i.e. a long/short
2:1 ratio). It works purely from an in-memory onset-strength envelope derived
from the audio and the beat grid produced by the temporal analyzer.

Security Notes:
    - Untrusted input is in-memory audio (a numpy float array) and a beat-time
      array only. No file, network, or shell access is performed here.
    - Bounded: the function operates exclusively on the passed arrays; it never
      reads paths, spawns processes, or opens sockets.
    - Safe failure: any degenerate input (fewer than three beats, empty audio,
      no detectable off-beat onsets) or unexpected error yields a deterministic
      neutral default. No exception is allowed to escape.
"""

from __future__ import annotations

import logging
from typing import Any, TypedDict

import librosa
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Fraction of each inter-beat interval trimmed from both ends before searching
# for the off-beat onset. This excludes the onsets of the surrounding beats
# themselves (whose energy dominates near the interval boundaries) so that only
# the genuine off-beat onset is measured.
BEAT_EXCLUSION_FRACTION = 0.1

# Relative-position threshold separating "straight" from "swing".
#
# A straight eighth note sits at the midpoint of the beat (relative position
# p = 0.5, long:short ratio 1.0). A triplet-based swing eighth sits at two
# thirds (p = 0.667, ratio 2.0). We split the two hypotheses at the midpoint of
# those positions, (0.5 + 0.667) / 2 = 0.583, rounded to 0.58. In ratio terms
# 0.58 corresponds to p / (1 - p) = 0.58 / 0.42 ~= 1.38, i.e. anything at or
# above ~1.4 is reported as swing.
SWING_POSITION_THRESHOLD = 0.58

# Reference spread used to normalize the inter-quartile range into a [0, 1]
# confidence. An IQR of 0 (perfectly consistent off-beat placement) maps to
# confidence 1.0; an IQR of half a beat or more maps to confidence 0.0.
CONFIDENCE_SPREAD_REFERENCE = 0.5


class GrooveResult(TypedDict):
    """Result of a groove/feel detection pass."""

    feel: str
    swing_ratio: float
    confidence: float


def _safe_default() -> GrooveResult:
    """Return the deterministic neutral result used on any degenerate input.

    Returns:
        A straight-feel result with unit swing ratio and zero confidence.
    """
    return {"feel": "straight", "swing_ratio": 1.0, "confidence": 0.0}


def _offbeat_positions(
    beats: NDArray[np.floating[Any]],
    onset_env: NDArray[np.floating[Any]],
    times: NDArray[np.floating[Any]],
) -> NDArray[np.float64]:
    """Measure the relative position of the dominant off-beat onset per beat.

    For each pair of consecutive beats the interval is trimmed at both ends
    (see ``BEAT_EXCLUSION_FRACTION``) to exclude the beats' own onsets, then the
    peak of the onset-strength envelope inside that window is located. Its
    position is expressed as a fraction ``p`` in [0, 1] of the way from the
    earlier beat to the later one.

    Args:
        beats: Sorted beat times in seconds.
        onset_env: Onset-strength envelope samples.
        times: Times in seconds aligned to ``onset_env``.

    Returns:
        Array of relative off-beat positions, one per interval that contained a
        detectable onset. May be empty.
    """
    positions: list[float] = []
    for i in range(beats.size - 1):
        b0 = float(beats[i])
        b1 = float(beats[i + 1])
        interval = b1 - b0
        if interval <= 0.0:
            continue
        margin = interval * BEAT_EXCLUSION_FRACTION
        lo = b0 + margin
        hi = b1 - margin
        mask = (times >= lo) & (times <= hi)
        if not bool(np.any(mask)):
            continue
        windowed = np.where(mask, onset_env, -np.inf)
        peak_idx = int(np.argmax(windowed))
        if onset_env[peak_idx] <= 0.0:
            continue
        positions.append((float(times[peak_idx]) - b0) / interval)
    return np.asarray(positions, dtype=np.float64)


def _swing_ratio(position: float) -> float:
    """Map a relative off-beat position to a long:short ratio.

    Args:
        position: Median off-beat position ``p`` in (0, 1).

    Returns:
        The ratio ``p / (1 - p)`` (~1.0 straight, ~2.0 triplet swing). If the
        position is at or beyond the beat boundary the ratio is clamped to a
        large finite value rather than dividing by zero.
    """
    denominator = 1.0 - position
    if denominator <= 0.0:
        return 1e6
    return position / denominator


def _confidence(positions: NDArray[np.float64]) -> float:
    """Derive a [0, 1] confidence from the consistency of off-beat positions.

    Consistency is measured as the inter-quartile range (IQR) of the positions,
    normalized against ``CONFIDENCE_SPREAD_REFERENCE`` and inverted so tightly
    clustered positions yield high confidence.

    Args:
        positions: Relative off-beat positions.

    Returns:
        Confidence in [0, 1].
    """
    q25, q75 = np.percentile(positions, [25.0, 75.0])
    iqr = float(q75) - float(q25)
    return float(np.clip(1.0 - iqr / CONFIDENCE_SPREAD_REFERENCE, 0.0, 1.0))


def detect_groove(
    audio: NDArray[np.floating[Any]],
    sr: int,
    beat_times: NDArray[np.floating[Any]] | list[float],
) -> GrooveResult:
    """Detect whether the audio has a straight or swing feel.

    The onset-strength envelope is computed from ``audio`` and, for each pair of
    consecutive beats, the dominant off-beat onset position is measured. The
    median off-beat position across the track is mapped to a long:short swing
    ratio and classified via ``SWING_POSITION_THRESHOLD``.

    Args:
        audio: Mono audio samples as a numpy float array.
        sr: Sample rate of ``audio`` in Hz.
        beat_times: Beat times in seconds (e.g. from ``librosa.beat.beat_track``).

    Returns:
        A ``GrooveResult`` with the detected ``feel`` ("straight" or "swing"),
        the estimated ``swing_ratio`` and a ``confidence`` in [0, 1]. Degenerate
        input or any internal error yields the neutral safe default.
    """
    try:
        beats = np.asarray(beat_times, dtype=np.float64)
        samples = np.asarray(audio, dtype=np.float64)
        if beats.size < 3 or samples.size == 0:
            return _safe_default()

        onset_env = librosa.onset.onset_strength(y=samples, sr=sr)
        times = librosa.times_like(onset_env, sr=sr)
        positions = _offbeat_positions(beats, onset_env, times)
        if positions.size == 0:
            return _safe_default()

        median_pos = float(np.median(positions))
        feel = "swing" if median_pos >= SWING_POSITION_THRESHOLD else "straight"
        return {
            "feel": feel,
            "swing_ratio": _swing_ratio(median_pos),
            "confidence": _confidence(positions),
        }
    except Exception:
        logger.exception("Groove detection failed; returning safe default")
        return _safe_default()
