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

            # Extract downbeats (simple approximation: every 4th beat)
            # A real model might use madmom or complex DBNs for precise downbeats
            downbeat_times = [float(bt) for i, bt in enumerate(beat_times) if i % 4 == 0]

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
