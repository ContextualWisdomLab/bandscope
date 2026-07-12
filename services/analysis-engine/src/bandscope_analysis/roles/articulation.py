"""Sustained-versus-choppy articulation detection per stem.

Classifies each separated stem's playing character for groove guidance:
whether a part holds long notes ("sustained") or plays short punctuated
figures ("choppy"), based on two metrics computed from the stem audio:

- Onset density: onsets per second of *active* audio, where active frames
  are RMS frames above 10% of the stem's global RMS.
- Duty cycle: fraction of active frames among all frames.

Character rule:
- "sustained" if duty_cycle > 0.6 and onset_density < 1.5 onsets/s.
- "choppy" if onset_density >= 3.0 onsets/s or duty_cycle < 0.35.
- "mixed" otherwise.

Security Notes:
- Operates purely on in-memory numpy arrays; no file I/O or network access.
- All computations are bounded by the input array sizes.
- Fails safe: invalid, empty, or silent audio yields a neutral "mixed"
  result with zeroed metrics, and no exceptions escape the public API.
"""

from __future__ import annotations

import logging
from typing import Any

import librosa
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Fine-grained RMS framing (~23 ms frames, ~6 ms hop at 44.1 kHz) so that
# short staccato bursts are not smeared into neighbouring silence.
RMS_FRAME_LENGTH = 512
RMS_HOP_LENGTH = 128

# Hop length for the onset-strength envelope and onset detection.
ONSET_HOP_LENGTH = 512

# An RMS frame is "active" when it exceeds this fraction of the global RMS.
ACTIVE_RMS_RATIO = 0.10

# Minimum peak onset strength for the stem to contain real note attacks.
# librosa's onset_detect normalizes the onset envelope, so a steady tone
# whose envelope is numerical noise (max ~0.05) would otherwise yield many
# spurious onsets; genuine attacks produce envelope peaks well above 1.0.
ONSET_ENV_FLOOR = 1.0

# Character rule thresholds (documented in the module docstring).
SUSTAINED_MAX_ONSET_DENSITY = 1.5
SUSTAINED_MIN_DUTY_CYCLE = 0.6
CHOPPY_MIN_ONSET_DENSITY = 3.0
CHOPPY_MAX_DUTY_CYCLE = 0.35

# Safe fallback for empty, silent, or unanalyzable audio.
_SAFE_DEFAULT: dict[str, str | float] = {
    "character": "mixed",
    "onset_density_per_s": 0.0,
    "duty_cycle": 0.0,
}


def _classify(onset_density: float, duty_cycle: float) -> str:
    """Classify articulation character from onset density and duty cycle.

    Args:
        onset_density: Onsets per second of active audio.
        duty_cycle: Fraction of active frames among all frames.

    Returns:
        One of "sustained", "choppy", or "mixed".
    """
    if duty_cycle > SUSTAINED_MIN_DUTY_CYCLE and onset_density < SUSTAINED_MAX_ONSET_DENSITY:
        return "sustained"
    if onset_density >= CHOPPY_MIN_ONSET_DENSITY or duty_cycle < CHOPPY_MAX_DUTY_CYCLE:
        return "choppy"
    return "mixed"


def analyze_articulation(
    audio: NDArray[np.floating[Any]],
    sr: int,
) -> dict[str, str | float]:
    """Analyze the articulation character of a single stem.

    Args:
        audio: Mono audio samples as a float numpy array.
        sr: Sample rate in Hz.

    Returns:
        Dict with keys "character" ("sustained" | "choppy" | "mixed"),
        "onset_density_per_s" (onsets per second of active audio), and
        "duty_cycle" (fraction of active frames). Empty, silent, or
        unanalyzable audio returns the safe default of a "mixed" character
        with zeroed metrics.
    """
    if not isinstance(audio, np.ndarray) or audio.size == 0 or sr <= 0:
        return dict(_SAFE_DEFAULT)

    try:
        samples = audio.astype(np.float32, copy=False)

        global_rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
        if global_rms <= 1e-10 or not np.isfinite(global_rms):
            return dict(_SAFE_DEFAULT)

        frame_rms = librosa.feature.rms(
            y=samples,
            frame_length=RMS_FRAME_LENGTH,
            hop_length=RMS_HOP_LENGTH,
        )[0]
        active_frames = int(np.count_nonzero(frame_rms > ACTIVE_RMS_RATIO * global_rms))
        total_frames = int(frame_rms.size)
        if active_frames == 0 or total_frames == 0:
            return dict(_SAFE_DEFAULT)

        duty_cycle = active_frames / total_frames
        active_seconds = active_frames * RMS_HOP_LENGTH / sr

        onset_env = librosa.onset.onset_strength(y=samples, sr=sr, hop_length=ONSET_HOP_LENGTH)
        if float(np.max(onset_env)) >= ONSET_ENV_FLOOR:
            onsets = librosa.onset.onset_detect(
                onset_envelope=onset_env,
                sr=sr,
                hop_length=ONSET_HOP_LENGTH,
                units="time",
            )
            onset_count = int(len(onsets))
        else:
            # No significant attack transients anywhere in the stem.
            onset_count = 0
        onset_density = onset_count / active_seconds

        return {
            "character": _classify(onset_density, duty_cycle),
            "onset_density_per_s": round(onset_density, 3),
            "duty_cycle": round(duty_cycle, 3),
        }
    except Exception:
        logger.warning("Articulation analysis failed; returning safe default", exc_info=True)
        return dict(_SAFE_DEFAULT)


def analyze_stem_articulation(
    stems: dict[str, NDArray[np.floating[Any]]],
    sr: int,
) -> dict[str, dict[str, str | float]]:
    """Analyze articulation character for every stem.

    Args:
        stems: Dict mapping stem names (e.g. "vocals", "bass", "drums",
            "other") to mono float audio arrays at a common sample rate.
        sr: Sample rate in Hz.

    Returns:
        Dict mapping each stem name to its articulation analysis result.
        An empty stems dict yields an empty dict.
    """
    return {name: analyze_articulation(audio, sr) for name, audio in stems.items()}
