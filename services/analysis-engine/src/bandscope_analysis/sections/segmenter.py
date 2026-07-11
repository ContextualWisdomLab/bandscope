"""Structural segmentation via self-similarity matrix (SSM) novelty curve.

Detects structural boundaries (Intro, Verse, Chorus, Bridge, etc.) from audio
features using a checkerboard kernel convolution over the SSM diagonal.

Security Notes:
- Processes untrusted audio features (numpy arrays from stems).
- No shell execution, network access, or user-controlled output paths.
- All numpy operations are bounded by array sizes; no unbounded allocations.
- Fails safely with an empty segment list when features are insufficient.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Literal

import librosa
import numpy as np
from numpy.typing import NDArray

from .._native import HAVE_RUST, _checkerboard_novelty_rust
from .model import ALL_SECTION_LABELS, CueAnchorStrategy, SectionCandidate

logger = logging.getLogger(__name__)

# Minimum segment duration in seconds to avoid micro-segments.
MIN_SEGMENT_DURATION_SECONDS = 4.0

# Maximum number of segments to return (avoids over-segmentation).
MAX_SEGMENTS = 20

# Maximum frame count for dense SSM construction.
MAX_SSM_FRAMES = 4096

# Canonical section label assignment order for repeating patterns.
_LABEL_ORDER: tuple[str, ...] = (
    "intro",
    "verse",
    "chorus",
    "verse",
    "chorus",
    "bridge",
    "chorus",
    "outro",
)


def compute_novelty_curve(
    audio: NDArray[np.floating[Any]],
    sr: int,
    hop_length: int = 512,
) -> tuple[NDArray[np.floating[Any]], NDArray[np.floating[Any]]]:
    """Compute a novelty curve from the self-similarity matrix of chroma features.

    Args:
        audio: Mono audio signal as a 1D float array.
        sr: Sample rate.
        hop_length: Hop length for feature extraction.

    Returns:
        Tuple of (novelty_curve, frame_times).
    """
    effective_hop_length = max(hop_length, math.ceil(audio.size / MAX_SSM_FRAMES))

    # Extract chroma features for structural comparison
    chroma = librosa.feature.chroma_cqt(y=audio, sr=sr, hop_length=effective_hop_length)

    # Build self-similarity matrix from chroma
    ssm = librosa.segment.recurrence_matrix(
        chroma,
        mode="affinity",
        metric="cosine",
        sparse=False,
        self=True,
    )

    # Compute novelty curve via checkerboard kernel along the diagonal
    novelty = _checkerboard_novelty(ssm)

    # Frame times for each novelty value
    frame_times = librosa.frames_to_time(
        np.arange(len(novelty)), sr=sr, hop_length=effective_hop_length
    )

    return novelty, frame_times


def _checkerboard_novelty(
    ssm: NDArray[np.floating[Any]],
    kernel_size: int = 64,
) -> NDArray[np.floating[Any]]:
    """Apply a checkerboard kernel along the SSM diagonal to detect boundaries.

    The checkerboard kernel highlights transitions where the local structure
    changes (i.e., moving from one repeated section to a new one).

    Uses the Rust ``bandscope_numeric`` kernel when available (the default),
    falling back to the NumPy reference implementation otherwise. Both paths are
    numerically equivalent (see ``tests/test_numeric_parity.py``).
    """
    if HAVE_RUST and _checkerboard_novelty_rust is not None:  # pragma: no cover - native path
        ssm_f64 = np.ascontiguousarray(ssm, dtype=np.float64)
        return _checkerboard_novelty_rust(ssm_f64, kernel_size)
    return _checkerboard_novelty_reference(ssm, kernel_size)


def _checkerboard_novelty_reference(
    ssm: NDArray[np.floating[Any]],
    kernel_size: int = 64,
) -> NDArray[np.floating[Any]]:
    """Pure-NumPy reference implementation of the checkerboard novelty kernel.

    Retained as the parity oracle for the Rust port and as the runtime fallback
    when the compiled extension is unavailable. Do not "optimize" the math here:
    it defines the canonical result.
    """
    n = ssm.shape[0]
    half = kernel_size // 2
    novelty = np.zeros(n, dtype=np.float64)

    if n < kernel_size:
        return novelty

    # Build checkerboard kernel
    kernel = np.ones((kernel_size, kernel_size), dtype=np.float64)
    kernel[:half, :half] = -1.0
    kernel[half:, half:] = -1.0

    # Extract all valid diagonal patches and compute dot products.
    valid_range = range(half, n - half)
    for i in valid_range:
        patch = ssm[i - half : i + half, i - half : i + half]
        novelty[i] = np.sum(patch * kernel)

    # Normalize by peak absolute magnitude, preserving sign.
    max_val = np.max(np.abs(novelty))
    if max_val > 0:
        novelty = novelty / max_val

    return novelty


def detect_boundaries(
    novelty: NDArray[np.floating[Any]],
    frame_times: NDArray[np.floating[Any]],
    duration: float,
    min_segment_seconds: float = MIN_SEGMENT_DURATION_SECONDS,
) -> list[float]:
    """Detect segment boundary times from novelty curve peaks.

    Args:
        novelty: The novelty curve values.
        frame_times: Time in seconds for each novelty frame.
        duration: Total audio duration in seconds.
        min_segment_seconds: Minimum distance between boundaries.

    Returns:
        Sorted list of boundary times (always starts with 0.0).
    """
    if len(novelty) < 3:
        return [0.0]

    # Find peaks in novelty curve using adaptive threshold
    threshold = float(np.mean(novelty) + 0.5 * np.std(novelty))
    threshold = max(threshold, 0.1)

    # Simple peak detection: local maxima above threshold
    peaks: list[int] = []
    for i, value in enumerate(novelty):
        left = novelty[i - 1] if i > 0 else float("-inf")
        right = novelty[i + 1] if i + 1 < len(novelty) else float("-inf")
        if value > threshold and value > left and value > right:
            peaks.append(i)

    # Convert peak frames to times
    boundary_times: list[float] = [0.0]
    for peak_idx in peaks:
        if peak_idx < len(frame_times):
            t = float(frame_times[peak_idx])
            # Enforce minimum segment duration
            if t - boundary_times[-1] >= min_segment_seconds and t < duration - 1.0:
                boundary_times.append(t)

    # Limit total segments
    if len(boundary_times) > MAX_SEGMENTS:
        boundary_times = boundary_times[:MAX_SEGMENTS]

    return boundary_times


# Two segments whose mean-chroma cosine similarity meets this are treated as the
# same repeated section (e.g. two choruses).
_REPETITION_SIMILARITY = 0.9


def _segment_repetition_groups(
    audio: NDArray[np.floating[Any]],
    sr: int,
    boundaries: list[float],
    duration: float,
) -> list[int]:
    """Group segments that repeat, by mean-chroma similarity.

    Returns a group id per segment; segments sharing an id are acoustically
    similar (a repeated section). Reuses the chroma the boundary detector relies
    on, so labels reflect the audio rather than a segment's position.

    Args:
        audio: Mono audio signal.
        sr: Sample rate.
        boundaries: Sorted boundary start times.
        duration: Total audio duration.

    Returns:
        A group id per segment, in segment order.
    """
    n = len(boundaries)
    if n == 0:
        return []
    hop = max(512, math.ceil(audio.size / MAX_SSM_FRAMES))
    chroma = librosa.feature.chroma_cqt(y=audio, sr=sr, hop_length=hop)
    n_frames = chroma.shape[1]
    reps: list[NDArray[np.floating[Any]]] = []
    groups: list[int] = []
    for i in range(n):
        start = boundaries[i]
        end = boundaries[i + 1] if i + 1 < n else duration
        f0 = min(int(start * sr / hop), n_frames - 1)
        f1 = min(max(int(end * sr / hop), f0 + 1), n_frames)
        vec = chroma[:, f0:f1].mean(axis=1)
        unit = vec / (float(np.linalg.norm(vec)) + 1e-9)
        match = next(
            (g for g, rep in enumerate(reps) if float(np.dot(unit, rep)) >= _REPETITION_SIMILARITY),
            -1,
        )
        if match < 0:
            match = len(reps)
            reps.append(unit)
        groups.append(match)
    return groups


def _labels_from_repetition(
    groups: list[int],
    boundaries: list[float],
    duration: float,
) -> list[tuple[str, int]]:
    """Name segments from their repetition groups.

    The most-repeated group is the chorus, other repeated groups are verses, and
    non-repeating segments are intro/outro (by position) or bridge.

    Args:
        groups: Repetition group id per segment.
        boundaries: Sorted boundary start times.
        duration: Total audio duration.

    Returns:
        List of (label, sequence_index) tuples, one per segment.
    """
    n = len(groups)
    sizes: dict[int, int] = {}
    first_seen: dict[int, int] = {}
    for i, g in enumerate(groups):
        sizes[g] = sizes.get(g, 0) + 1
        first_seen.setdefault(g, i)
    repeated = sorted(
        (g for g, count in sizes.items() if count >= 2),
        key=lambda g: (-sizes[g], first_seen[g]),
    )
    group_label = {g: ("chorus" if rank == 0 else "verse") for rank, g in enumerate(repeated)}

    labels: list[tuple[str, int]] = []
    counts: dict[str, int] = {}
    for i, g in enumerate(groups):
        if g in group_label:
            label = group_label[g]
        elif i == 0:
            label = "intro"
        elif i == n - 1 and boundaries[i] / max(duration, 1.0) > 0.85:
            label = "outro"
        else:
            label = "bridge"
        counts[label] = counts.get(label, 0) + 1
        labels.append((label, counts[label]))
    return labels


def assign_section_labels(
    boundaries: list[float],
    duration: float,
    repetition_groups: list[int] | None = None,
) -> list[tuple[str, int]]:
    """Assign canonical section labels to detected segments.

    When ``repetition_groups`` is provided, labels come from actual acoustic
    repetition (most-repeated group -> chorus, other repeats -> verse, unique
    edges -> intro/outro, unique middles -> bridge). Without it, falls back to
    structural position heuristics.

    Args:
        boundaries: Sorted boundary start times.
        duration: Total audio duration.
        repetition_groups: Optional repetition group id per segment.

    Returns:
        List of (label, sequence_index) tuples, one per segment.
    """
    n_segments = len(boundaries)
    if n_segments == 0:
        return []

    if repetition_groups is not None:
        return _labels_from_repetition(repetition_groups, boundaries, duration)

    labels: list[tuple[str, int]] = []
    label_counts: dict[str, int] = {}

    for i in range(n_segments):
        start = boundaries[i]
        end = boundaries[i + 1] if i + 1 < n_segments else duration

        segment_duration = end - start
        relative_position = start / max(duration, 1.0)

        # Heuristic label assignment
        if i == 0 and segment_duration < duration * 0.15:
            label = "intro"
        elif i == n_segments - 1 and relative_position > 0.85:
            label = "outro"
        elif i < len(_LABEL_ORDER):
            label = _LABEL_ORDER[i]
        else:
            # Cycle through verse/chorus for remaining segments
            cycle_idx = (i - 1) % 2
            label = "verse" if cycle_idx == 0 else "chorus"

        label_counts[label] = label_counts.get(label, 0) + 1
        labels.append((label, label_counts[label]))

    return labels


def segment_audio(
    audio: NDArray[np.floating[Any]],
    sr: int,
    duration: float | None = None,
) -> list[SectionCandidate]:
    """Run full structural segmentation pipeline on audio.

    Args:
        audio: Mono audio signal.
        sr: Sample rate.
        duration: Optional pre-computed duration. Calculated if not provided.

    Returns:
        List of SectionCandidate dicts with detected boundaries and labels.
    """
    if audio.size == 0:
        return []

    if duration is None:
        duration = float(audio.size) / sr

    if duration < MIN_SEGMENT_DURATION_SECONDS * 2:
        return _single_section_fallback("Audio too short for structural analysis")

    try:
        boundaries = _compute_boundaries(audio, sr, duration)
    except Exception as e:
        logger.warning("Structural segmentation failed, falling back to single section: %s", e)
        return _single_section_fallback(f"Segmentation fallback: {e}")

    return _sections_from_boundaries(boundaries, duration, audio, sr)


def segment_boundaries_from_audio(
    audio: NDArray[np.floating[Any]],
    sr: int,
    duration: float | None = None,
) -> list[tuple[float, float]]:
    """Return raw (start, end) boundary pairs from audio segmentation.

    Useful for downstream role activity detection which needs time ranges.

    Args:
        audio: Mono audio signal.
        sr: Sample rate.
        duration: Optional pre-computed duration.

    Returns:
        List of (start_seconds, end_seconds) tuples for each segment.
    """
    if audio.size == 0:
        return []

    if duration is None:
        duration = float(audio.size) / sr

    if duration < MIN_SEGMENT_DURATION_SECONDS * 2:
        return [(0.0, duration)]

    try:
        boundaries = _compute_boundaries(audio, sr, duration)
    except Exception as e:
        logger.warning("Boundary detection failed: %s", e)
        return [(0.0, duration)]

    return _boundary_pairs_from_boundaries(boundaries, duration)


def segment_with_boundaries(
    audio: NDArray[np.floating[Any]],
    sr: int,
    duration: float | None = None,
) -> tuple[list[SectionCandidate], list[tuple[float, float]]]:
    """Run segmentation and return both section candidates and boundary pairs.

    This preserves one helper call-site for downstream code that needs both
    section candidates and boundary pairs.

    Args:
        audio: Mono audio signal.
        sr: Sample rate.
        duration: Optional pre-computed duration.

    Returns:
        Tuple of (section_candidates, boundary_pairs).
    """
    if audio.size == 0:
        return [], []

    if duration is None:
        duration = float(audio.size) / sr

    if duration < MIN_SEGMENT_DURATION_SECONDS * 2:
        return _single_section_fallback("Audio too short for structural analysis"), [
            (0.0, duration)
        ]

    try:
        boundaries = _compute_boundaries(audio, sr, duration)
    except Exception as e:
        logger.warning("Structural segmentation failed, falling back to single section: %s", e)
        return _single_section_fallback(f"Segmentation fallback: {e}"), [(0.0, duration)]

    return _sections_from_boundaries(
        boundaries, duration, audio, sr
    ), _boundary_pairs_from_boundaries(boundaries, duration)


def _single_section_fallback(confidence_notes: str) -> list[SectionCandidate]:
    """Build a single low-confidence verse section for segmentation fallback."""
    return [
        {
            "id": "verse-1",
            "form_label": "verse",
            "sequence_index": 1,
            "groove": "standard",
            "confidence_level": "low",
            "confidence_source": "model",
            "confidence_notes": confidence_notes,
            "cue_anchor": {
                "strategy": CueAnchorStrategy.COUNT.value,
                "value": "Enter on beat 1 of bar 1",
            },
        }
    ]


def _sections_from_boundaries(
    boundaries: list[float],
    duration: float,
    audio: NDArray[np.floating[Any]],
    sr: int,
) -> list[SectionCandidate]:
    """Build section candidates from precomputed boundary start times."""
    groups = _segment_repetition_groups(audio, sr, boundaries, duration)
    labels = assign_section_labels(boundaries, duration, groups)
    sections: list[SectionCandidate] = []
    n_boundaries = len(boundaries)

    for i, (label, seq_idx) in enumerate(labels):
        start_time = boundaries[i]
        end_time = boundaries[i + 1] if i + 1 < n_boundaries else duration

        confidence_level: Literal["low", "medium", "high"] = (
            "high" if label in ALL_SECTION_LABELS else "low"
        )

        sections.append(
            {
                "id": f"{label}-{seq_idx}",
                "form_label": label,
                "sequence_index": seq_idx,
                "groove": "standard",
                "confidence_level": confidence_level,
                "confidence_source": "model",
                "confidence_notes": (
                    f"Detected via SSM novelty at {start_time:.1f}s-{end_time:.1f}s"
                ),
                "cue_anchor": {
                    "strategy": CueAnchorStrategy.COUNT.value,
                    "value": "Enter on beat 1 of bar 1",
                },
            }
        )

    return sections


def _boundary_pairs_from_boundaries(
    boundaries: list[float], duration: float
) -> list[tuple[float, float]]:
    """Build `(start, end)` boundary pairs from precomputed boundary start times."""
    pairs: list[tuple[float, float]] = []
    for i in range(len(boundaries)):
        start = boundaries[i]
        end = boundaries[i + 1] if i + 1 < len(boundaries) else duration
        pairs.append((start, end))
    return pairs


def _compute_boundaries(
    audio: NDArray[np.floating[Any]],
    sr: int,
    duration: float,
) -> list[float]:
    """Compute raw boundary times from audio (shared implementation).

    Args:
        audio: Mono audio signal.
        sr: Sample rate.
        duration: Total audio duration.

    Returns:
        Sorted list of boundary start times.
    """
    novelty, frame_times = compute_novelty_curve(audio, sr)
    return detect_boundaries(novelty, frame_times, duration)
