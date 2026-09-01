"""Bounded PCM decode port for the Resource Admission & Decode context.

This module is the single analysis-engine boundary that may turn an admitted
container into PCM.  The current adapter still delegates to ``librosa`` and is
therefore a transitional owner while #1129 removes the libsndfile-backed
runtime graph.  Consumers must call this port rather than selecting decoder
fallbacks themselves.

Security Notes:
- Untrusted input: caller-authorized local audio handles/paths, container
  metadata, decoder output, and third-party decoder exceptions.
- Trust boundary: metadata admission happens before PCM decode and decoded PCM
  is revalidated before it can enter MIR/DSP consumers.
- Privacy: third-party decoder details are retained only as exception causes;
  the surfaced resource-policy error is stable and payload-free.
- Dependency boundary: this adapter deliberately centralizes the legacy
  librosa decoder so the commercial #1129 replacement has one owned seam. It
  does not claim that libsndfile has already been removed.
"""

from __future__ import annotations

import warnings
from typing import Any, cast

import librosa
import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.audio_metadata import AudioSource, preflight_audio_metadata
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicy,
    AudioResourcePolicyError,
    policy_rejection_message,
    validate_decoded_audio,
)

KNOWN_LIBROSA_NUMBA_WARNING_FILTERS = (
    (DeprecationWarning, r".*pkg_resources is deprecated.*", r".*librosa.*"),
    (FutureWarning, r".*Numba.*", r".*numba.*"),
)

AudioMonoArray = NDArray[np.float32]


def _malformed_decode_error() -> AudioResourcePolicyError:
    """Build the stable payload-free decoder failure."""
    return AudioResourcePolicyError(
        "malformed_header", policy_rejection_message("malformed_header")
    )


def decode_mono_audio(
    source: AudioSource,
    *,
    target_sample_rate_hz: int,
    max_duration_seconds: float,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> tuple[AudioMonoArray, int]:
    """Admit and decode one source to bounded mono float32 PCM.

    The source is first measured against the same resource policy that later
    revalidates the decoded buffer. Decoder/provider detail never becomes the
    surfaced error message.
    """
    preflight_audio_metadata(source, policy)

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=DeprecationWarning, module=r"^audioread")
            warnings.filterwarnings("ignore", category=FutureWarning, module=r"^audioread")
            for category, message, module in KNOWN_LIBROSA_NUMBA_WARNING_FILTERS:
                warnings.filterwarnings(
                    "ignore",
                    category=category,
                    message=message,
                    module=module,
                )
            decoded, sample_rate = librosa.load(  # type: ignore[arg-type]
                source,
                sr=target_sample_rate_hz,
                mono=True,
                duration=max_duration_seconds,
            )
    except Exception as error:
        raise _malformed_decode_error() from error

    try:
        pcm = np.ravel(np.asarray(decoded, dtype=np.float32))
    except (TypeError, ValueError) as error:
        raise _malformed_decode_error() from error

    validate_decoded_audio(pcm, sample_rate, policy)
    return cast(AudioMonoArray, pcm), int(sample_rate)
