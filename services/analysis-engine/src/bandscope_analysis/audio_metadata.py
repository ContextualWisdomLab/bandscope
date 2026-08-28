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

from typing import BinaryIO

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


def _malformed_header_error() -> AudioResourcePolicyError:
    """Build the stable payload-free container-probe failure."""
    return AudioResourcePolicyError(
        "malformed_header", policy_rejection_message("malformed_header")
    )


def preflight_audio_metadata(
    fileobj: BinaryIO,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Validate source duration, sample rate, and channel count without decoding PCM."""
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
