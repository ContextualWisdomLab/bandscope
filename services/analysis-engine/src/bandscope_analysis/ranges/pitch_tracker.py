"""Pitch tracker using librosa's pYIN algorithm for monophonic pitch estimation."""

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
    """Extracts lowest and highest notes from audio data using pYIN pitch estimation.

    Security Notes:
    - Processes untrusted audio arrays from stem separation.
    - No file I/O, network access, or shell execution.
    - Bounded computation: frame count capped by input duration.
    - Safe failure: exceptions in pYIN return empty range with low confidence.
    """

    def track(self, y: np.ndarray, sr: int = 22050) -> TrackedPitchRange:
        """Track pitch in an audio array and return the lowest/highest note.

        Uses pYIN (probabilistic YIN) for monophonic pitch estimation,
        with confidence derived from voicing probability distribution
        and noise level analysis.

        Args:
            y: Audio time series.
            sr: Sampling rate.

        Returns:
            Dictionary containing lowest_note, highest_note, and confidence.
        """
        if len(y) == 0:
            return {"lowest_note": None, "highest_note": None, "confidence": "low"}

        # Using librosa.pyin for monophonic pitch estimation
        fmin = float(librosa.note_to_hz("C1"))
        fmax = float(librosa.note_to_hz("C8"))

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

        # Use percentiles to avoid spurious single-frame errors
        if len(voiced_f0) < 10:
            p_low, p_high = np.min(voiced_f0), np.max(voiced_f0)
        else:
            p_low = np.percentile(voiced_f0, 5)
            p_high = np.percentile(voiced_f0, 95)

        # Convert Hz to Note
        lowest_note = librosa.hz_to_note(p_low)
        highest_note = librosa.hz_to_note(p_high)

        # Calculate confidence using multiple factors
        confidence = self._compute_confidence(voiced_probs, voiced_flag, y)

        # If voicing probability is very low, treat as unvoiced regardless of confidence
        if voiced_probs is not None and len(voiced_probs) > 0:
            valid_probs = voiced_probs[~np.isnan(voiced_probs)]
            avg_prob = float(np.mean(valid_probs)) if len(valid_probs) > 0 else 0.0
        else:
            avg_prob = 0.0
        if avg_prob < 0.2:
            return {"lowest_note": None, "highest_note": None, "confidence": "low"}

        # Clean up note names
        return {
            "lowest_note": str(lowest_note).replace("\u266f", "#"),
            "highest_note": str(highest_note).replace("\u266f", "#"),
            "confidence": confidence,
        }

    def _compute_confidence(
        self,
        voiced_probs: np.ndarray | None,
        voiced_flag: np.ndarray,
        y: np.ndarray,
    ) -> str:
        """Compute confidence from voicing probabilities and signal quality.

        Combines multiple heuristics:
        1. Average voicing probability (higher = more confident pitch detection).
        2. Voicing ratio (proportion of frames detected as voiced).
        3. Signal-to-noise estimate from RMS energy.

        Args:
            voiced_probs: Per-frame voicing probabilities from pYIN.
            voiced_flag: Boolean voiced/unvoiced decision per frame.
            y: Original audio array for SNR estimation.

        Returns:
            Confidence level: 'low', 'medium', or 'high'.
        """
        # Factor 1: Average voicing probability
        if voiced_probs is not None and len(voiced_probs) > 0:
            valid_probs = voiced_probs[~np.isnan(voiced_probs)]
            avg_prob = float(np.mean(valid_probs)) if len(valid_probs) > 0 else 0.0
        else:
            avg_prob = 0.0

        # Factor 2: Voicing ratio (fraction of frames that are voiced)
        total_frames = len(voiced_flag) if voiced_flag is not None else 0
        voiced_count = int(np.sum(voiced_flag)) if voiced_flag is not None else 0
        voicing_ratio = voiced_count / total_frames if total_frames > 0 else 0.0

        # Factor 3: Signal energy indicator (low energy = less confidence)
        rms = float(np.sqrt(np.mean(y**2))) if len(y) > 0 else 0.0
        energy_factor = min(1.0, rms / 0.05) if rms > 0 else 0.0

        # Combined confidence score
        score = 0.5 * avg_prob + 0.3 * voicing_ratio + 0.2 * energy_factor

        if score > 0.6:
            return "high"
        if score > 0.35:
            return "medium"
        return "low"
