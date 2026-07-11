"""Temporal analyzer implementation for audio ingestion and beat tracking."""

from __future__ import annotations

import logging
import os
import warnings
from pathlib import Path
from typing import Any

import librosa
import numpy as np
from numpy.typing import NDArray

from .model import TemporalFeatures

logger = logging.getLogger(__name__)

# Standard sample rate for BandScope analysis
TARGET_SR = 44100
MAX_AUDIO_FILE_BYTES = 100 * 1024 * 1024  # 100 MiB
MAX_ANALYSIS_DURATION_SECONDS = 15 * 60  # 15 minutes
KNOWN_LIBROSA_NUMBA_WARNING_FILTERS = (
    (DeprecationWarning, r".*pkg_resources is deprecated.*", r".*librosa.*"),
    (FutureWarning, r".*Numba.*", r".*numba.*"),
)
# ponytail: assumes 4/4; upgrade to meter estimation or a madmom DBN if other meters matter.
BEATS_PER_BAR = 4


def _estimate_downbeats(
    onset_env: NDArray[np.floating[Any]],
    beat_frames: NDArray[np.integer[Any]],
    beat_times: NDArray[np.floating[Any]],
    beats_per_bar: int = BEATS_PER_BAR,
) -> list[float]:
    """Pick the bar phase whose beats carry the most onset energy as the downbeats.

    Downbeats are typically the strongest onset in a bar, so instead of blindly
    treating beat 0 as the downbeat we sample the onset-strength envelope at each
    beat and choose the phase (0..beats_per_bar-1) with the highest mean strength.
    This looks at the actual audio rather than assuming beat 0 starts the bar.
    """
    if len(beat_times) == 0:
        return []
    if len(beat_times) < beats_per_bar or len(onset_env) == 0:
        return [float(beat_times[0])]
    idx = np.clip(beat_frames, 0, len(onset_env) - 1)
    beat_strength = onset_env[idx]
    best_phase, best_score = 0, -np.inf
    for phase in range(beats_per_bar):
        window = beat_strength[phase::beats_per_bar]
        score = float(np.mean(window)) if len(window) else -np.inf
        if score > best_score:
            best_score, best_phase = score, phase
    return [float(bt) for i, bt in enumerate(beat_times) if (i - best_phase) % beats_per_bar == 0]


class TemporalAnalyzer:
    """Analyzes temporal features (BPM, beats) from audio files."""

    def analyze(self, audio_path: str | Path) -> TemporalFeatures:
        """Decode audio and extract temporal features.

        Args:
            audio_path: Path to the audio file.

        Returns:
            TemporalFeatures containing BPM and beat grids.
        """
        path = Path(audio_path)
        path_str = str(path)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {path_str}")

        logger.info(f"Loading and decoding audio: {path_str}")

        try:
            with path.open("rb") as fileobj:
                file_size = os.fstat(fileobj.fileno()).st_size
                if file_size > MAX_AUDIO_FILE_BYTES:
                    raise ValueError(
                        f"Audio file is too large for temporal analysis: {file_size} bytes "
                        f"(max {MAX_AUDIO_FILE_BYTES} bytes)"
                    )

                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore", category=DeprecationWarning, module=r"^audioread"
                    )
                    warnings.filterwarnings("ignore", category=FutureWarning, module=r"^audioread")

                    # Keep the loader's known third-party churn quiet without hiding
                    # unrelated decoder warnings that tests and callers should see.
                    for category, message, module in KNOWN_LIBROSA_NUMBA_WARNING_FILTERS:
                        warnings.filterwarnings(
                            "ignore",
                            category=category,
                            message=message,
                            module=module,
                        )
                    # Load audio, converting to mono and standardizing sample rate
                    y, sr = librosa.load(
                        fileobj,
                        sr=TARGET_SR,
                        mono=True,
                        duration=MAX_ANALYSIS_DURATION_SECONDS,
                    )

            # Ensure it's a 1D float array for librosa
            if not isinstance(y, np.ndarray):
                raise ValueError("Expected numpy array from librosa.load")

            y_array: NDArray[np.floating[Any]] = y
            duration = float(librosa.get_duration(y=y_array, sr=sr))

            logger.info("Extracting tempo and beat tracking...")
            # Use librosa's robust beat tracker
            tempo, beat_frames = librosa.beat.beat_track(y=y_array, sr=sr)

            # Convert frame indices to time (seconds)
            beat_times: NDArray[np.floating[Any]] = librosa.frames_to_time(beat_frames, sr=sr)

            # Place downbeats on the strongest-onset bar phase (looks at the audio,
            # not a blind "every 4th beat from index 0").
            onset_env = librosa.onset.onset_strength(y=y_array, sr=sr)
            downbeat_times = _estimate_downbeats(onset_env, beat_frames, beat_times)

            bpm_val = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)

            logger.info(f"Analysis complete: {bpm_val:.1f} BPM, {len(beat_times)} beats detected.")

            return {
                "bpm": bpm_val,
                "beat_times": [float(bt) for bt in beat_times],
                "downbeat_times": downbeat_times,
                "duration_seconds": duration,
                "sample_rate": int(sr),
                "audio_path": path_str,
            }

        except Exception as e:
            logger.error(f"Failed to analyze audio {path_str}: {e}")
            raise ValueError(f"Temporal analysis failed: {e}") from e
