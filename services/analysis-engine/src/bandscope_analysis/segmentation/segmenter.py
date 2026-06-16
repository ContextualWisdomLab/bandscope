"""Audio structural segmentation using SSM and novelty curves.

Uses librosa's self-similarity matrix (SSM) and onset novelty curves to detect
structural boundaries (Intro, Verse, Chorus, Bridge, Outro, etc.) from raw audio.
"""

from __future__ import annotations

import logging
from typing import Any

import librosa
import numpy as np
from numpy.typing import NDArray

from .model import SegmentationResult, SegmentBoundary

logger = logging.getLogger(__name__)

# Minimum segment duration in seconds — boundaries closer than this are merged.
_MIN_SEGMENT_SECONDS = 8.0

# Form-label sequence heuristics based on normalised position in the song.
# Positions are (start_frac, end_frac) → label priority list.
_POSITION_LABELS: list[tuple[float, float, str]] = [
    (0.0, 0.12, "intro"),
    (0.12, 0.35, "verse"),
    (0.35, 0.55, "chorus"),
    (0.55, 0.70, "bridge"),
    (0.70, 0.88, "verse"),
    (0.88, 1.0, "outro"),
]

# Standard repeating label cycle when segments outnumber heuristic slots.
_LABEL_CYCLE = ["verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]


def _infer_label(seg_index: int, total_segs: int, start_frac: float) -> str:
    """Infer a SectionLabel string for a segment from its position in the song."""
    if total_segs <= 1:
        return "verse"

    # Boundary cases
    if seg_index == 0:
        return "intro"
    if seg_index == total_segs - 1:
        return "outro"

    # Use positional heuristics for short songs; fall back to label cycle for long ones.
    if total_segs <= len(_POSITION_LABELS) + 2:
        for lo, hi, label in _POSITION_LABELS:
            if lo <= start_frac < hi:
                return label

    cycle_index = (seg_index - 1) % len(_LABEL_CYCLE)
    return _LABEL_CYCLE[cycle_index]


def _merge_close_boundaries(
    boundary_times: NDArray[np.floating[Any]], min_gap: float
) -> list[float]:
    """Remove boundaries that are too close together, keeping the stronger one."""
    if len(boundary_times) == 0:
        return []
    merged: list[float] = [float(boundary_times[0])]
    for t in boundary_times[1:]:
        if float(t) - merged[-1] >= min_gap:
            merged.append(float(t))
    return merged


class AudioSegmenter:
    """Detects structural segment boundaries from an audio array.

    Two complementary methods are fused:
    - **SSM (self-similarity matrix)**: captures long-range repetition structure
      (verse / chorus repeats).
    - **Novelty curve**: captures local timbral change points (transitions between
      contrasting sections).

    Both methods use chroma + MFCC features so the result is sensitive to both
    harmonic and timbral differences.
    """

    def segment(self, y: NDArray[np.floating[Any]], sr: int) -> SegmentationResult:
        """Detect structural segment boundaries.

        Args:
            y: Mono audio time series.
            sr: Sample rate in Hz.

        Returns:
            SegmentationResult with ordered SegmentBoundary entries.
        """
        duration = float(librosa.get_duration(y=y, sr=sr))

        if duration < _MIN_SEGMENT_SECONDS * 2:
            # Audio too short to meaningfully segment
            return self._fallback_result(duration)

        try:
            return self._segment_ssm_novelty(y, sr, duration)
        except Exception as exc:
            logger.warning("SSM segmentation failed (%s); using fallback.", exc)
            return self._fallback_result(duration)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_feature_matrix(
        self, y: NDArray[np.floating[Any]], sr: int
    ) -> NDArray[np.floating[Any]]:
        """Build a combined chroma + MFCC feature matrix for the audio."""
        hop_length = 512

        # Chroma CQT — captures harmonic structure (chord changes, key)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)

        # MFCC — captures timbral texture (instrumentation changes)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
        mfcc_delta = librosa.feature.delta(mfcc)

        # Stack and L2-normalise
        features = np.vstack([chroma, mfcc, mfcc_delta])
        norms: NDArray[np.floating[Any]] = np.linalg.norm(features, axis=0, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        result: NDArray[np.floating[Any]] = features / norms
        return result

    def _novelty_boundaries(
        self,
        features: NDArray[np.floating[Any]],
        sr: int,
        duration: float,
    ) -> list[float]:
        """Detect boundaries using a checkerboard-kernel novelty curve."""
        hop_length = 512

        # Build SSM from feature matrix
        ssm = librosa.segment.recurrence_matrix(
            features, width=3, mode="affinity", sym=True
        )

        # Convert to novelty via diagonal filter
        novelty = librosa.onset.onset_strength(S=np.abs(ssm), sr=sr, hop_length=hop_length)

        # Find peaks in novelty curve
        frame_peaks = librosa.util.peak_pick(
            novelty,
            pre_max=3,
            post_max=3,
            pre_avg=3,
            post_avg=5,
            delta=0.05,
            wait=10,
        )
        times = librosa.frames_to_time(frame_peaks, sr=sr, hop_length=hop_length)

        # Filter: keep only peaks within the audio duration
        times = times[(times > 0) & (times < duration)]
        return _merge_close_boundaries(times, _MIN_SEGMENT_SECONDS)

    def _ssm_boundaries(
        self,
        features: NDArray[np.floating[Any]],
        sr: int,
        duration: float,
        n_segments: int,
    ) -> list[float]:
        """Detect boundaries via agglomerative segmentation on the SSM."""
        hop_length = 512
        n_frames = features.shape[1]

        # Guard: need enough frames to segment
        if n_frames < n_segments * 4:
            return []

        boundary_frames = librosa.segment.agglomerative(features, k=n_segments)
        times = librosa.frames_to_time(boundary_frames, sr=sr, hop_length=hop_length)
        times = times[(times > 0) & (times < duration)]
        return _merge_close_boundaries(times, _MIN_SEGMENT_SECONDS)

    def _segment_ssm_novelty(
        self, y: NDArray[np.floating[Any]], sr: int, duration: float
    ) -> SegmentationResult:
        """Run the full SSM + novelty fusion pipeline."""
        features = self._build_feature_matrix(y, sr)

        # --- Novelty-curve pass ---
        novelty_times = self._novelty_boundaries(features, sr, duration)

        # --- SSM agglomerative pass ---
        # Target segment count: roughly 1 per 30 s of audio, clamped to [3, 10]
        target_n = max(3, min(10, int(duration / 30)))
        try:
            ssm_times = self._ssm_boundaries(features, sr, duration, target_n)
        except Exception:
            ssm_times = []

        # --- Fuse: union of both, de-duplicated and sorted ---
        all_times = sorted(set(novelty_times) | set(ssm_times))
        fused = _merge_close_boundaries(np.array(all_times), _MIN_SEGMENT_SECONDS)

        if not fused:
            return self._fallback_result(duration)

        boundaries = self._build_boundaries(fused, duration)
        method = "ssm_novelty"
        notes = (
            f"Fused SSM ({len(ssm_times)} boundaries) and novelty "
            f"({len(novelty_times)} boundaries) into {len(boundaries)} segments."
        )
        return {
            "boundaries": boundaries,
            "duration_seconds": duration,
            "method": method,
            "segmentation_notes": notes,
        }

    def _build_boundaries(
        self, change_points: list[float], duration: float
    ) -> list[SegmentBoundary]:
        """Convert a list of change-point times into SegmentBoundary objects."""
        all_starts = [0.0] + change_points
        all_ends = change_points + [duration]
        total = len(all_starts)

        boundaries: list[SegmentBoundary] = []
        for i, (start, end) in enumerate(zip(all_starts, all_ends, strict=True)):
            if end <= start:
                continue
            start_frac = start / duration if duration > 0 else 0.0
            label = _infer_label(i, total, start_frac)
            confidence: str = "medium" if total > 2 else "low"
            if i == 0 or i == total - 1:
                confidence = "high"
            boundaries.append(
                {
                    "start_sec": round(start, 3),
                    "end_sec": round(end, 3),
                    "label": label,
                    "confidence": confidence,  # type: ignore[typeddict-item]
                }
            )
        return boundaries

    def _fallback_result(self, duration: float) -> SegmentationResult:
        """Return a single-segment fallback when detection fails or audio is too short."""
        boundaries: list[SegmentBoundary] = [
            {
                "start_sec": 0.0,
                "end_sec": round(duration, 3),
                "label": "verse",
                "confidence": "low",
            }
        ]
        return {
            "boundaries": boundaries,
            "duration_seconds": duration,
            "method": "fallback",
            "segmentation_notes": "Audio too short or segmentation failed; using single segment.",
        }
