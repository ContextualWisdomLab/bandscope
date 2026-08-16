"""Canonical resource admission policy for local audio analysis.

The policy is intentionally independent of individual analyzers. Expensive
feature code consumes a decoded artifact only after encoded-file and decoded
output checks agree on the same versioned limits. This prevents temporal,
separation, chord, and register features from silently inventing incompatible
resource ceilings.

Security Notes:
- Encoded byte counts are validated before decode/allocation work when the
  opened file descriptor can provide an authoritative size.
- Decoded audio is revalidated because container metadata and decoder behavior
  are untrusted; accepted artifacts are finite, mono, floating-point, at the
  configured sample rate, and within the configured decoded-sample budget.
- Decoders receive a one-sample-over-budget probe duration so a longer source is
  rejected instead of being silently truncated to the accepted duration.
- Policy arithmetic rejects unrepresentable limits before float/sample-count
  conversion so malformed configuration cannot escape the stable failure mode.
- Validation errors are payload-free and never include source paths or audio
  content.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

AUDIO_RESOURCE_POLICY_VERSION = "1"
DEFAULT_TARGET_SAMPLE_RATE = 44_100
DEFAULT_MAX_ENCODED_FILE_BYTES = 100 * 1024 * 1024
DEFAULT_MAX_DURATION_SECONDS = 15 * 60
_POLICY_ERROR = "Audio input violates the audio resource policy."


@dataclass(frozen=True)
class AudioResourcePolicy:
    """Versioned limits applied before and after local audio decoding.

    Args:
        max_encoded_file_bytes: Maximum non-empty encoded source size.
        target_sample_rate: Required sample rate of the canonical decoded mono
            artifact.
        max_duration_seconds: Maximum decoded duration represented as a sample
            ceiling at ``target_sample_rate``.
    """

    max_encoded_file_bytes: int = DEFAULT_MAX_ENCODED_FILE_BYTES
    target_sample_rate: int = DEFAULT_TARGET_SAMPLE_RATE
    max_duration_seconds: float = float(DEFAULT_MAX_DURATION_SECONDS)

    def __post_init__(self) -> None:
        """Reject invalid policy configuration before it can weaken admission."""
        if (
            isinstance(self.max_encoded_file_bytes, bool)
            or not isinstance(self.max_encoded_file_bytes, int)
            or self.max_encoded_file_bytes <= 0
            or self.max_encoded_file_bytes > sys.maxsize - 1
        ):
            raise ValueError(_POLICY_ERROR)
        if (
            isinstance(self.target_sample_rate, bool)
            or not isinstance(self.target_sample_rate, int)
            or self.target_sample_rate <= 0
            or self.target_sample_rate > sys.maxsize - 1
        ):
            raise ValueError(_POLICY_ERROR)
        if isinstance(self.max_duration_seconds, bool) or not isinstance(
            self.max_duration_seconds, int | float
        ):
            raise ValueError(_POLICY_ERROR)
        try:
            duration_seconds = float(self.max_duration_seconds)
        except (OverflowError, ValueError):
            raise ValueError(_POLICY_ERROR) from None
        if not math.isfinite(duration_seconds) or duration_seconds <= 0.0:
            raise ValueError(_POLICY_ERROR)
        decoded_samples = self.target_sample_rate * duration_seconds
        if (
            not math.isfinite(decoded_samples)
            or decoded_samples < 1.0
            or decoded_samples > sys.maxsize - 1
        ):
            raise ValueError(_POLICY_ERROR)

    @property
    def max_decoded_samples(self) -> int:
        """Return the maximum mono sample count allowed after decoding."""
        return int(self.target_sample_rate * float(self.max_duration_seconds))

    @property
    def decode_probe_duration_seconds(self) -> float:
        """Return a bounded decoder duration that includes one rejection probe sample."""
        return (self.max_decoded_samples + 1) / self.target_sample_rate

    def validate_encoded_file_bytes(self, file_size: object) -> int:
        """Validate an authoritative encoded file size before decoding.

        Args:
            file_size: Byte count obtained from the already-open source file.

        Returns:
            The validated integer byte count.

        Raises:
            ValueError: If the value is not a positive integer within policy.
        """
        if (
            isinstance(file_size, bool)
            or not isinstance(file_size, int)
            or file_size <= 0
            or file_size > self.max_encoded_file_bytes
        ):
            raise ValueError(_POLICY_ERROR)
        return file_size

    def validate_decoded_audio(
        self,
        audio: object,
        sample_rate: object,
    ) -> NDArray[np.floating[Any]]:
        """Revalidate the canonical decoded artifact before feature analysis.

        Args:
            audio: Candidate mono NumPy array returned by the decoder.
            sample_rate: Decoder-reported sample rate in Hz.

        Returns:
            The original validated NumPy floating-point array without copying it.

        Raises:
            ValueError: If dtype, shape, sample rate, sample count, or finiteness
                does not satisfy this policy.
        """
        if (
            not isinstance(audio, np.ndarray)
            or audio.ndim != 1
            or audio.size == 0
            or not np.issubdtype(audio.dtype, np.floating)
        ):
            raise ValueError(_POLICY_ERROR)
        if (
            isinstance(sample_rate, bool)
            or not isinstance(sample_rate, int)
            or sample_rate != self.target_sample_rate
        ):
            raise ValueError(_POLICY_ERROR)
        if audio.size > self.max_decoded_samples or not np.isfinite(audio).all():
            raise ValueError(_POLICY_ERROR)
        return cast(NDArray[np.floating[Any]], audio)


DEFAULT_AUDIO_RESOURCE_POLICY = AudioResourcePolicy()

__all__ = [
    "AUDIO_RESOURCE_POLICY_VERSION",
    "AudioResourcePolicy",
    "DEFAULT_AUDIO_RESOURCE_POLICY",
    "DEFAULT_MAX_DURATION_SECONDS",
    "DEFAULT_MAX_ENCODED_FILE_BYTES",
    "DEFAULT_TARGET_SAMPLE_RATE",
]
