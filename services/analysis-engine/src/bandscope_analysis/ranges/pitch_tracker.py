"""Pitch tracker using librosa's pYIN or YIN algorithm."""

import logging
from typing import Optional, TypedDict

import librosa
import numpy as np

logger = logging.getLogger(__name__)


class TrackedPitchRange(TypedDict):
    """Result of pitch tracking over an audio segment."""

    lowest_note: Optional[str]
    highest_note: Optional[str]
    confidence: str


class PitchTracker:
    """Extracts lowest and highest notes from audio data."""

    def track(self, y: np.ndarray, sr: int = 22050) -> TrackedPitchRange:
        """
        Track pitch in an audio array and return the lowest/highest note.

        Args:
            y: Audio time series.
            sr: Sampling rate.

        Returns:
            Dictionary containing lowest_note, highest_note, and confidence.
        """
        if len(y) == 0:
            return {"lowest_note": None, "highest_note": None, "confidence": "low"}

        # Using librosa.piptrack or librosa.pyin
        # pyin is more accurate for monophonic signals but slower.
        # We can use it with standard fmin and fmax
        fmin = float(librosa.note_to_hz("C1"))
        fmax = float(librosa.note_to_hz("C8"))

        # We can try to use pyin, but if it fails or returns no pitch, fallback.
        try:
            f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=fmin, fmax=fmax, sr=sr)
        except librosa.util.exceptions.ParameterError as e:
            logger.warning("pYIN failed: %s", e)
            return {"lowest_note": None, "highest_note": None, "confidence": "low"}

        # Filter f0 to only keep voiced frames
        voiced_f0 = f0[voiced_flag] if f0 is not None else np.array([])

        # Remove NaNs
        voiced_f0 = voiced_f0[~np.isnan(voiced_f0)]

        if len(voiced_f0) == 0:
            return {"lowest_note": None, "highest_note": None, "confidence": "low"}

        # Optional: we might want to filter outliers, e.g. using percentiles
        # to avoid spurious single-frame errors. Let's use 5th and 95th percentiles.
        # But if there are very few frames, just take min and max.
        if len(voiced_f0) < 10:
            p_low, p_high = np.min(voiced_f0), np.max(voiced_f0)
        else:
            p_low = np.percentile(voiced_f0, 5)
            p_high = np.percentile(voiced_f0, 95)

        # Convert Hz to Note
        lowest_note = librosa.hz_to_note(p_low)
        highest_note = librosa.hz_to_note(p_high)

        # Calculate confidence
        avg_prob = (
            np.mean(voiced_probs[~np.isnan(voiced_probs)])
            if voiced_probs is not None and len(voiced_probs) > 0
            else 0.0
        )
        confidence = "high" if avg_prob > 0.6 else "low"

        # If the average probability is very low, treat as unvoiced
        if avg_prob < 0.2:
            return {"lowest_note": None, "highest_note": None, "confidence": "low"}

        # Clean up note names (e.g. C#4 instead of C♯4 or handles flats etc, librosa uses '#')
        return {
            "lowest_note": str(lowest_note).replace("♯", "#"),
            "highest_note": str(highest_note).replace("♯", "#"),
            "confidence": confidence,
        }
