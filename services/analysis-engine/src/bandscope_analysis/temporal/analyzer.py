"""Temporal analyzer implementation for audio ingestion and beat tracking."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import librosa
import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.audio_decode import decode_mono_audio
from bandscope_analysis.audio_resource_policy import (
    MAX_DURATION_SECONDS,
    MAX_ENCODED_FILE_BYTES,
    TARGET_SAMPLING_RATE_HZ,
    AudioResourcePolicyError,
    policy_rejection_message,
)

from .model import TemporalFeatures

logger = logging.getLogger(__name__)

MAX_ANALYSIS_DURATION_SECONDS = MAX_DURATION_SECONDS
MAX_AUDIO_FILE_BYTES = MAX_ENCODED_FILE_BYTES
TARGET_SR = TARGET_SAMPLING_RATE_HZ

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
                # MAX_AUDIO_FILE_BYTES remains monkeypatchable for tests.
                if file_size > MAX_AUDIO_FILE_BYTES:
                    raise AudioResourcePolicyError(
                        "encoded_file_too_large",
                        policy_rejection_message("encoded_file_too_large"),
                    )

            y_array, sr = decode_mono_audio(
                path,
                target_sample_rate_hz=TARGET_SR,
                max_duration_seconds=MAX_ANALYSIS_DURATION_SECONDS,
            )
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

        except AudioResourcePolicyError as error:
            logger.info(
                "Rejected audio against resource policy version %s (%s)",
                error.policy_version,
                error.reason,
            )
            raise
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Failed to analyze audio {path_str}: {e}")
            raise ValueError(f"Temporal analysis failed: {e}") from e
