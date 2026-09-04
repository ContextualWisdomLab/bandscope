"""Bounded metadata preflight for caller-owned local audio sources.

Security Notes:
- Untrusted input: container headers and decoder metadata from caller-owned
  binary handles or already-selected local paths.
- Trust boundary: this module inspects metadata only; path-backed sources use
  the local libsndfile/audioread decoders and never open network resources.
- Safe failure: parser failures and malformed metadata become payload-free
  ``AudioResourcePolicyError`` values before resampling, downmixing, or
  duration truncation can hide the original source characteristics.
- Resource behavior: ``soundfile.info`` reads container metadata without
  loading the audio contents into memory; path-backed fallback metadata uses
  audioread's fixed local decoder invocation, while file-like handles are
  rewound for the downstream decoder.
"""

from __future__ import annotations

import os
from typing import BinaryIO, TypeAlias

import audioread  # type: ignore[import-untyped]  # audioread has no py.typed marker.
import soundfile  # type: ignore[import-untyped]  # soundfile has no py.typed marker.

from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicy,
    AudioResourcePolicyError,
    policy_rejection_message,
    validate_channel_count,
    validate_duration_seconds,
    validate_source_sampling_rate,
)

AudioSource: TypeAlias = BinaryIO | str | os.PathLike[str]


def _malformed_header_error() -> AudioResourcePolicyError:
    """Build the stable payload-free container-probe failure."""
    return AudioResourcePolicyError(
        "malformed_header", policy_rejection_message("malformed_header")
    )


def preflight_audio_metadata(
    audio_source: AudioSource,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Validate source metadata without decoding PCM into the analysis process.

    Path-backed sources use audioread's existing local decoder fallback when
    libsndfile cannot inspect a compressed container such as M4A. File-like
    sources remain on the libsndfile-only path because audioread requires a
    filesystem path for its fixed decoder invocation.
    """
    if isinstance(audio_source, (str, os.PathLike)):
        try:
            audio_metadata = soundfile.info(audio_source)
        except Exception:
            try:
                with audioread.audio_open(str(audio_source)) as decoder_descriptor:
                    validate_source_sampling_rate(
                        decoder_descriptor.samplerate, audio_resource_policy
                    )
                    validate_channel_count(
                        decoder_descriptor.channels, audio_resource_policy
                    )
                    validate_duration_seconds(
                        decoder_descriptor.duration, audio_resource_policy
                    )
                return
            except AudioResourcePolicyError:
                raise
            except Exception as metadata_error:
                raise _malformed_header_error() from metadata_error

        validate_source_sampling_rate(audio_metadata.samplerate, audio_resource_policy)
        validate_channel_count(audio_metadata.channels, audio_resource_policy)
        sampling_rate_hz = int(audio_metadata.samplerate)
        validate_duration_seconds(
            float(audio_metadata.frames) / float(sampling_rate_hz),
            audio_resource_policy,
        )
        return

    audio_file_object = audio_source
    try:
        audio_file_object.seek(0)
        audio_metadata = soundfile.info(audio_file_object)
    except Exception as metadata_error:
        # No decoder runs after a failed metadata probe, so there is no consumer
        # that needs the rejected handle rewound. Preserve the parser failure as
        # the internal cause instead of masking it with a best-effort seek.
        raise _malformed_header_error() from metadata_error

    try:
        audio_file_object.seek(0)
    except Exception as rewind_error:
        raise _malformed_header_error() from rewind_error

    validate_source_sampling_rate(audio_metadata.samplerate, audio_resource_policy)
    validate_channel_count(audio_metadata.channels, audio_resource_policy)
    sampling_rate_hz = int(audio_metadata.samplerate)
    duration_seconds = float(audio_metadata.frames) / float(sampling_rate_hz)
    validate_duration_seconds(duration_seconds, audio_resource_policy)
