"""Temporal analyzer implementation for audio ingestion and beat tracking."""

from __future__ import annotations

import logging
import warnings
from pathlib import Path
from typing import Any

import librosa
import numpy as np
from numpy.typing import NDArray

from .model import TemporalFeatures

import concurrent.futures
import threading

logger = logging.getLogger(__name__)

# Standard sample rate for BandScope analysis
TARGET_SR = 44100
KNOWN_LIBROSA_NUMBA_WARNING_FILTERS = (
    (DeprecationWarning, r".*pkg_resources is deprecated.*", r".*librosa.*"),
    (FutureWarning, r".*Numba.*", r".*numba.*"),
)

MAX_AUDIO_FILE_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_AUDIO_DURATION = 600.0  # 10 minutes
_ANALYSIS_TIMEOUT = 120.0  # 2 minutes
_CONCURRENCY_SEMAPHORE = threading.Semaphore(4)


class TemporalAnalyzer:
    """Analyzes temporal features (BPM, beats) from audio files."""

    def __init__(self) -> None:
        """Initialize the temporal analyzer."""
        pass

    def analyze(self, audio_path: str | Path) -> TemporalFeatures:
        """Decode audio and extract temporal features.

        Args:
            audio_path: Path to the audio file.

        Returns:
            TemporalFeatures containing BPM and beat grids.
        """
        audio_file = Path(audio_path)
        path_str = str(audio_file)
        if not audio_file.exists() or not audio_file.is_file():
            raise FileNotFoundError(f"Audio file not found: {path_str}")

        file_size = audio_file.stat().st_size
        if file_size > MAX_AUDIO_FILE_BYTES:
            raise ValueError(f"File size {file_size} exceeds maximum {MAX_AUDIO_FILE_BYTES} bytes")

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pre_duration = float(librosa.get_duration(path=path_str))
                if pre_duration > MAX_AUDIO_DURATION:
                    raise ValueError(f"Duration {pre_duration} exceeds maximum {MAX_AUDIO_DURATION} seconds")
        except Exception as e:
            if isinstance(e, ValueError) and "exceeds maximum" in str(e):
                raise
            logger.warning(f"Failed to get duration for {path_str}: {e}")

        logger.info(f"Loading and decoding audio: {path_str}")

        def _do_analyze() -> TemporalFeatures:
            try:
                with warnings.catch_warnings():
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
                    # Pass a safe duration to cap how much audio is read
                    y, sr = librosa.load(path_str, sr=TARGET_SR, mono=True, duration=MAX_AUDIO_DURATION)

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

        with _CONCURRENCY_SEMAPHORE:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_do_analyze)
                try:
                    return future.result(timeout=_ANALYSIS_TIMEOUT)
                except concurrent.futures.TimeoutError as e:
                    raise TimeoutError("Analysis timed out") from e
