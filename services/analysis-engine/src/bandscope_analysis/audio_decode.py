"""Bounded PCM decode port for the Resource Admission & Decode context.

The current adapter still delegates to ``librosa`` and therefore remains a
transitional boundary while #1129 removes the libsndfile-backed runtime graph.
Consumers must call this port rather than selecting decoder fallbacks
independently.

Security Notes:
- The caller-authorized binary handle, container metadata, decoder output, and
  third-party decoder exceptions are untrusted.
- Encoded byte size is measured and admitted from the caller-owned seekable
  handle before metadata parsing or decode work begins.
- Source metadata is admitted before decode and the resulting PCM is revalidated
  against the same versioned policy before it can enter MIR or model work.
- Decoder output must already be one-dimensional when ``mono=True``; a malformed
  multi-channel shape is rejected rather than flattened into false mono PCM.
- Decoder details remain exception causes only; the surfaced failure is the
  payload-free canonical resource-policy error.
- This port adds no path, network, subprocess, or credential authority.
"""

from __future__ import annotations

import warnings
from typing import BinaryIO, cast

import librosa
import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.audio_metadata import preflight_audio_metadata
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)

AudioMonoArray = NDArray[np.float32]


def _malformed_decode_error() -> AudioResourcePolicyError:
    """Build the stable payload-free decoder failure."""
    return AudioResourcePolicyError("malformed_header")


def _measure_encoded_source_bytes(source: BinaryIO) -> int:
    """Measure one seekable encoded source and restore it to the decode origin."""
    try:
        source.seek(0, 2)
        file_size = source.tell()
        source.seek(0)
    except Exception as error:
        raise _malformed_decode_error() from error
    return file_size


def decode_mono_audio(
    source: BinaryIO,
    *,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> tuple[AudioMonoArray, int]:
    """Admit and decode one caller-owned source to bounded mono float32 PCM."""
    policy.validate_encoded_file_bytes(_measure_encoded_source_bytes(source))
    preflight_audio_metadata(source, policy)

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=DeprecationWarning, module=r"^audioread")
            warnings.filterwarnings("ignore", category=FutureWarning, module=r"^audioread")
            decoded, sample_rate = librosa.load(
                source,
                sr=policy.target_sample_rate,
                mono=True,
                duration=policy.decode_probe_duration_seconds,
            )
    except AudioResourcePolicyError:
        raise
    except Exception as error:
        raise _malformed_decode_error() from error

    try:
        decoded_array = np.asarray(decoded)
        if decoded_array.ndim != 1:
            raise _malformed_decode_error()
        pcm = np.asarray(decoded_array, dtype=np.float32)
    except AudioResourcePolicyError:
        raise
    except (OverflowError, TypeError, ValueError) as error:
        raise _malformed_decode_error() from error

    try:
        policy.validate_decoded_audio(pcm, sample_rate)
    except AudioResourcePolicyError:
        raise
    except Exception as error:
        raise _malformed_decode_error() from error
    return cast(AudioMonoArray, pcm), int(sample_rate)