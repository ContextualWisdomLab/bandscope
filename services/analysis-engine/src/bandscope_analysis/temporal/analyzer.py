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

logger = logging.getLogger(__name__)

# Standard sample rate for BandScope analysis
TARGET_SR = 44100


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
        path_str = str(audio_path)
        if not Path(audio_path).exists():
            raise FileNotFoundError(f"Audio file not found: {path_str}")

        logger.info(f"Loading and decoding audio: {path_str}")

        try:
            # Load audio, converting to mono and standardizing sample rate
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", category=DeprecationWarning)
                warnings.simplefilter("ignore", category=FutureWarning)
                y, sr = librosa.load(path_str, sr=TARGET_SR, mono=True)

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
