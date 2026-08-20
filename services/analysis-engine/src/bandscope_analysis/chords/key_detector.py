"""Musical key detection using the Krumhansl-Schmuckler algorithm."""

import logging
from typing import TypedDict

import librosa
import numpy as np

logger = logging.getLogger(__name__)

# Pitch-class names ordered from C upward.
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Kessler experimental key profiles for the major and minor modes.
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


class KeyResult(TypedDict):
    """Result of key detection for an audio excerpt."""

    key: str
    tonic: str
    mode: str
    confidence: float


def _empty_result() -> KeyResult:
    """Return the canonical empty result used for degenerate or failed input."""
    return {"key": "", "tonic": "", "mode": "", "confidence": 0.0}


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    """Compute the Pearson correlation coefficient of two equal-length vectors.

    Returns 0.0 when either vector has zero variance, since correlation is
    undefined in that case.
    """
    a_centered = a - a.mean()
    b_centered = b - b.mean()
    denominator = float(np.sqrt(np.sum(a_centered**2) * np.sum(b_centered**2)))
    if denominator == 0.0:
        return 0.0
    return float(np.sum(a_centered * b_centered) / denominator)


class KeyDetector:
    """Estimate the musical key of audio via Krumhansl-Schmuckler profile matching.

    The detector builds a 12-bin pitch-class profile from a constant-Q
    chromagram, then correlates it against the 24 rotated Krumhansl-Kessler
    major and minor key profiles. The rotation with the highest Pearson
    correlation names the key. Confidence is derived from the gap between the
    best and second-best correlations (see ``detect``), giving a bounded value
    in ``[0.0, 1.0]``.

    Security Notes:
    - Operates on untrusted in-memory audio arrays only.
    - No file, network, or shell access of any kind.
    - Bounded by the size of the passed input array.
    - Safe failure: degenerate input returns an empty result and no exception
      is allowed to escape ``detect``.
    - Unexpected dependency failures log only the operation and exception
      class; dependency messages and tracebacks stay out of routine logs.
    """

    def detect(self, audio: np.ndarray, sr: int) -> KeyResult:
        """Detect the musical key of a mono audio signal.

        Args:
            audio: Mono audio samples as a 1-D float numpy array.
            sr: Sample rate of ``audio`` in hertz.

        Returns:
            A mapping with ``key`` (e.g. ``"C major"``), ``tonic``, ``mode``
            (``"major"`` or ``"minor"``) and ``confidence`` in ``[0.0, 1.0]``.
            Degenerate or failing input yields the empty result
            ``{"key": "", "tonic": "", "mode": "", "confidence": 0.0}``.
        """
        if audio.size == 0:
            return _empty_result()

        try:
            # tuning=0.0 skips librosa's internal tuning estimation, which keeps
            # detection deterministic and avoids an unstable native pitch-track
            # code path on pure synthetic tones.
            chroma = librosa.feature.chroma_cqt(y=audio, sr=sr, tuning=0.0)
        except Exception as error:  # noqa: BLE001 - safe failure: never raise to caller.
            logger.error(
                "chroma_cqt failed during key detection: %s",
                type(error).__name__,
            )
            return _empty_result()

        if chroma.size == 0:
            return _empty_result()

        # Average the chromagram over time into a 12-bin pitch-class profile.
        profile = np.asarray(chroma, dtype=np.float64).mean(axis=1)

        total = float(profile.sum())
        if total <= 0.0:
            return _empty_result()
        profile = profile / total

        return self._match_profile(profile)

    def _match_profile(self, profile: np.ndarray) -> KeyResult:
        """Correlate a pitch-class profile against all 24 key profiles.

        Args:
            profile: A normalized 12-bin pitch-class profile.

        Returns:
            The best-matching key as a :class:`KeyResult`.
        """
        correlations: list[tuple[float, str, str]] = []
        for tonic_index in range(12):
            major_rotated = np.roll(_MAJOR_PROFILE, tonic_index)
            minor_rotated = np.roll(_MINOR_PROFILE, tonic_index)
            correlations.append(
                (_pearson(profile, major_rotated), _NOTE_NAMES[tonic_index], "major")
            )
            correlations.append(
                (_pearson(profile, minor_rotated), _NOTE_NAMES[tonic_index], "minor")
            )

        correlations.sort(key=lambda item: item[0], reverse=True)
        best_corr, tonic, mode = correlations[0]
        second_corr = correlations[1][0]

        return {
            "key": f"{tonic} {mode}",
            "tonic": tonic,
            "mode": mode,
            "confidence": self._confidence(best_corr, second_corr),
        }

    @staticmethod
    def _confidence(best_corr: float, second_corr: float) -> float:
        """Map correlation scores to a bounded confidence in ``[0.0, 1.0]``.

        Confidence blends how strong the best correlation is with how clearly
        it separates from the runner-up. It is the mean of the clamped best
        correlation (negative correlations clamped to zero) and the clamped
        gap to the second-best correlation, keeping the result within
        ``[0.0, 1.0]``.

        Args:
            best_corr: Pearson correlation of the winning key profile.
            second_corr: Pearson correlation of the runner-up key profile.

        Returns:
            A confidence score bounded to ``[0.0, 1.0]``.
        """
        strength = min(max(best_corr, 0.0), 1.0)
        gap = min(max(best_corr - second_corr, 0.0), 1.0)
        return float((strength + gap) / 2.0)
