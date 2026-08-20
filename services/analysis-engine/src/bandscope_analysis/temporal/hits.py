"""Stop-time and shared-hit detection across separated stems.

Detects rehearsal-critical coordination points in a multi-stem mix:
stop-time moments where every active stem cuts out together mid-song,
and shared hits where accent onsets land together across roles.

Security Notes:
- Operates on in-memory numpy arrays only; no file I/O or network access.
- All computation is bounded by the input array lengths.
- Fails safe: malformed, empty, or silent input yields empty lists and no
  exceptions escape the public functions.
- Unexpected failures log only the operation and exception class; dependency
  messages and tracebacks stay out of routine logs.
"""

from __future__ import annotations

import logging
from typing import Any

import librosa
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Frame energy below this fraction of the stem's global RMS counts as quiet.
STOP_TIME_QUIET_RATIO = 0.1

# Minimum duration (seconds) of an all-quiet run to count as stop-time.
STOP_TIME_MIN_SECONDS = 0.3

# Onsets from different stems within this window (seconds) form one hit.
SHARED_HIT_WINDOW_SECONDS = 0.05

# A shared hit needs onsets from at least this many stems, capped by the
# number of stems that produced any onsets (but never fewer than two).
SHARED_HIT_MIN_STEMS = 3


def _energetic_stems(
    stems: dict[str, NDArray[np.floating[Any]]],
) -> dict[str, NDArray[np.float64]]:
    """Filter stems down to mono float64 arrays with non-zero overall energy.

    Args:
        stems: Dict mapping stem names to audio arrays.

    Returns:
        Dict mapping stem names to flattened float64 arrays whose global RMS
        is strictly positive. Non-array, empty, and silent stems are dropped.
    """
    active: dict[str, NDArray[np.float64]] = {}
    for name, audio in stems.items():
        if not isinstance(audio, np.ndarray) or audio.size == 0:
            continue
        samples = np.ravel(audio).astype(np.float64)
        if float(np.sqrt(np.mean(samples**2))) <= 0.0:
            continue
        active[name] = samples
    return active


def detect_stop_time(
    stems: dict[str, NDArray[np.floating[Any]]],
    sr: int,
    frame_seconds: float = 0.1,
) -> list[dict[str, float]]:
    """Detect stop-time moments where all energetic stems break together.

    A stop-time moment is a run of frames of at least
    ``STOP_TIME_MIN_SECONDS`` where every stem with any overall energy drops
    below ``STOP_TIME_QUIET_RATIO`` of its own global RMS, bounded by
    energetic frames on both sides (an internal break, not leading or
    trailing silence).

    Args:
        stems: Dict mapping stem names to mono audio arrays at ``sr``.
        sr: Sample rate in Hz shared by all stems.
        frame_seconds: Analysis frame length in seconds.

    Returns:
        List of ``{"start_time": float, "end_time": float}`` dicts with times
        in seconds rounded to 2 decimals. Empty on invalid or silent input.
    """
    try:
        return _detect_stop_time(stems, sr, frame_seconds)
    except Exception as error:
        logger.error(
            "Stop-time detection failed; returning no moments: %s",
            type(error).__name__,
        )
        return []


def _detect_stop_time(
    stems: dict[str, NDArray[np.floating[Any]]],
    sr: int,
    frame_seconds: float,
) -> list[dict[str, float]]:
    """Run stop-time detection; see :func:`detect_stop_time`.

    Args:
        stems: Dict mapping stem names to mono audio arrays at ``sr``.
        sr: Sample rate in Hz shared by all stems.
        frame_seconds: Analysis frame length in seconds.

    Returns:
        List of stop-time moment dicts (may raise; caller fails safe).
    """
    active = _energetic_stems(stems)
    if not active:
        return []

    frame_length = int(frame_seconds * sr)
    if frame_length <= 0:
        return []

    n_frames = min(audio.size for audio in active.values()) // frame_length
    if n_frames == 0:
        return []

    all_quiet = np.ones(n_frames, dtype=bool)
    for audio in active.values():
        frames = audio[: n_frames * frame_length].reshape(n_frames, frame_length)
        frame_rms = np.sqrt(np.mean(frames**2, axis=1))
        global_rms = float(np.sqrt(np.mean(audio**2)))
        all_quiet &= frame_rms < STOP_TIME_QUIET_RATIO * global_rms

    min_frames = max(1, int(np.ceil(STOP_TIME_MIN_SECONDS / frame_seconds)))
    moments: list[dict[str, float]] = []
    run_start: int | None = None
    for index in range(n_frames + 1):
        quiet = index < n_frames and bool(all_quiet[index])
        if quiet and run_start is None:
            run_start = index
        elif not quiet and run_start is not None:
            # Internal break only: energetic frames on both sides.
            if index - run_start >= min_frames and run_start > 0 and index < n_frames:
                moments.append(
                    {
                        "start_time": round(run_start * frame_seconds, 2),
                        "end_time": round(index * frame_seconds, 2),
                    }
                )
            run_start = None
    return moments


def detect_shared_hits(
    stems: dict[str, NDArray[np.floating[Any]]],
    sr: int,
) -> list[dict[str, float | int]]:
    """Detect shared hits where onsets from multiple stems coincide.

    Onset times are computed per stem via ``librosa.onset.onset_detect``.
    A shared hit is a time where onsets from at least
    ``SHARED_HIT_MIN_STEMS`` stems (or all stems that produced onsets, if
    fewer than that are active, but never fewer than two) coincide within
    ``SHARED_HIT_WINDOW_SECONDS``.

    Args:
        stems: Dict mapping stem names to mono audio arrays at ``sr``.
        sr: Sample rate in Hz shared by all stems.

    Returns:
        List of ``{"time": float, "stem_count": int}`` dicts with times in
        seconds rounded to 2 decimals. Empty on invalid or silent input.
    """
    try:
        return _detect_shared_hits(stems, sr)
    except Exception as error:
        logger.error(
            "Shared-hit detection failed; returning no hits: %s",
            type(error).__name__,
        )
        return []


def _detect_shared_hits(
    stems: dict[str, NDArray[np.floating[Any]]],
    sr: int,
) -> list[dict[str, float | int]]:
    """Run shared-hit detection; see :func:`detect_shared_hits`.

    Args:
        stems: Dict mapping stem names to mono audio arrays at ``sr``.
        sr: Sample rate in Hz shared by all stems.

    Returns:
        List of shared-hit dicts (may raise; caller fails safe).
    """
    if sr <= 0:
        return []

    events: list[tuple[float, str]] = []
    stems_with_onsets = 0
    for name, audio in _energetic_stems(stems).items():
        onsets = librosa.onset.onset_detect(y=audio, sr=sr, units="time")
        times = np.atleast_1d(np.asarray(onsets, dtype=np.float64))
        if times.size > 0:
            stems_with_onsets += 1
            events.extend((float(onset_time), name) for onset_time in times)

    required = max(2, min(SHARED_HIT_MIN_STEMS, stems_with_onsets))
    events.sort()

    hits: list[dict[str, float | int]] = []
    index = 0
    while index < len(events):
        end = index
        while end < len(events) and events[end][0] - events[index][0] <= SHARED_HIT_WINDOW_SECONDS:
            end += 1
        cluster = events[index:end]
        cluster_stems = {name for _, name in cluster}
        if len(cluster_stems) >= required:
            mean_time = float(np.mean([onset_time for onset_time, _ in cluster]))
            hits.append({"time": round(mean_time, 2), "stem_count": len(cluster_stems)})
            index = end
        else:
            index += 1
    return hits
