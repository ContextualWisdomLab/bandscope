"""Bounded metadata preflight for caller-owned local audio handles.

Security Notes:
- Untrusted input: container headers parsed from caller-owned binary handles.
- Trust boundary: this module inspects metadata only; it never decodes PCM,
  follows paths, or opens network resources.
- Safe failure: parser failures and malformed metadata become payload-free
  ``AudioResourcePolicyError`` values before resampling, downmixing, or
  duration truncation can hide the original source characteristics.
- Resource behavior: ``soundfile.info`` reads container metadata without
  loading the audio contents into memory, and the handle is rewound for the
  downstream decoder.
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
    source: AudioSource,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Validate source metadata without decoding PCM into the analysis process.

    Path-backed sources use audioread's existing local decoder fallback when
    libsndfile cannot inspect a compressed container such as M4A. File-like
    sources remain on the libsndfile-only path because audioread requires a
    filesystem path for its fixed decoder invocation.
    """
    if isinstance(source, (str, os.PathLike)):
        try:
            info = soundfile.info(source)
        except Exception:
            try:
                with audioread.audio_open(str(source)) as descriptor:
                    validate_source_sampling_rate(descriptor.samplerate, policy)
                    validate_channel_count(descriptor.channels, policy)
                    validate_duration_seconds(descriptor.duration, policy)
                return
            except AudioResourcePolicyError:
                raise
            except Exception as error:
                raise _malformed_header_error() from error

        validate_source_sampling_rate(info.samplerate, policy)
        validate_channel_count(info.channels, policy)
        sampling_rate_hz = int(info.samplerate)
        validate_duration_seconds(float(info.frames) / float(sampling_rate_hz), policy)
        return

    fileobj = source
    try:
        fileobj.seek(0)
        info = soundfile.info(fileobj)
    except Exception as error:
        # No decoder runs after a failed metadata probe, so there is no consumer
        # that needs the rejected handle rewound. Preserve the parser failure as
        # the internal cause instead of masking it with a best-effort seek.
        raise _malformed_header_error() from error

    try:
        fileobj.seek(0)
    except Exception as error:
        raise _malformed_header_error() from error

    validate_source_sampling_rate(info.samplerate, policy)
    validate_channel_count(info.channels, policy)
    sampling_rate_hz = int(info.samplerate)
    duration_seconds = float(info.frames) / float(sampling_rate_hz)
    validate_duration_seconds(duration_seconds, policy)
