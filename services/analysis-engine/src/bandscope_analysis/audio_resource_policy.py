"""Canonical local-audio resource policy for BandScope analysis.

Security Notes:
- Untrusted input: encoded file size, container metadata, decoded arrays,
  sampling rate, and channel count supplied by callers or decoders.
- Trust boundary: this module classifies resources only. It does not open
  files, decode audio, follow paths, or talk to the network.
- Safe failure: overflow, non-finite values, and policy disagreement fail
  closed with payload-free copy that names the next rehearsal action.
- Privacy: rejection messages never include paths, sizes, durations, or
  header bytes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, NoReturn

import numpy as np

AUDIO_RESOURCE_POLICY_VERSION: Final[int] = 1
_MAX_SAFE_PRODUCT: Final[int] = 2**63 - 1

# 15 minutes is the existing rehearsal-intake evidence (temporal analysis and
# YouTube import), not an invented five-minute cap.
_MAX_DURATION_SECONDS: Final[int] = 15 * 60
_TARGET_SAMPLING_RATE_HZ: Final[int] = 44100
_BYTES_PER_DECODED_SAMPLE: Final[int] = 4
_MAX_CHANNEL_COUNT: Final[int] = 2

POLICY_MESSAGES: Final[dict[str, str]] = {
    "encoded_file_too_large": "Choose a shorter or smaller song file to start analysis.",
    "duration_exceeded": "Choose a song shorter than 15 minutes to start analysis.",
    "duration_too_short": "Choose a longer song file to start analysis.",
    "sampling_rate_unsupported": (
        "Choose a WAV, MP3, FLAC, or M4A file recorded at a standard sample rate."
    ),
    "channel_count_unsupported": "Choose a mono or stereo song file to start analysis.",
    "decoded_sample_count_exceeded": "Choose a shorter song file to start analysis.",
    "memory_budget_exceeded": "Choose a shorter or smaller song file to start analysis.",
    "non_finite_metadata": "Choose another song file. This one could not be measured safely.",
    "integer_overflow": "Choose another song file. This one could not be measured safely.",
    "malformed_header": "Choose another song file. This one could not be read as audio.",
}


class AudioResourcePolicyError(ValueError):
    """Payload-free rejection of one audio resource against the canonical policy."""

    def __init__(self, reason: str, message: str) -> None:
        """Record the stable reason code together with operator-safe copy."""
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.policy_version = AUDIO_RESOURCE_POLICY_VERSION


@dataclass(frozen=True)
class AudioResourcePolicy:
    """Versioned bounds shared by desktop intake, IPC, orchestration, and analyzers."""

    version: int
    max_encoded_file_bytes: int
    max_duration_seconds: float
    min_duration_seconds: float
    min_source_sampling_rate_hz: int
    max_source_sampling_rate_hz: int
    target_sampling_rate_hz: int
    min_channel_count: int
    max_channel_count: int
    max_decoded_sample_count: int
    bytes_per_decoded_sample: int
    max_decoded_memory_bytes: int


def policy_rejection_message(reason: str) -> str:
    """Return payload-free copy that names the next rehearsal action."""
    try:
        return POLICY_MESSAGES[reason]
    except KeyError as error:
        raise AudioResourcePolicyError(
            "malformed_header", POLICY_MESSAGES["malformed_header"]
        ) from error


def _raise(reason: str) -> NoReturn:
    """Fail closed with the stable reason and payload-free copy."""
    raise AudioResourcePolicyError(reason, policy_rejection_message(reason))


def _checked_int_product(left: int, right: int) -> int:
    """Multiply two non-negative integers or fail closed on overflow."""
    if left < 0 or right < 0:
        _raise("integer_overflow")
    if left != 0 and right > _MAX_SAFE_PRODUCT // left:
        _raise("integer_overflow")
    return left * right


_MAX_DECODED_SAMPLE_COUNT = _checked_int_product(_MAX_DURATION_SECONDS, _TARGET_SAMPLING_RATE_HZ)
_MAX_DECODED_MEMORY_BYTES = _checked_int_product(
    _checked_int_product(_MAX_DECODED_SAMPLE_COUNT, _MAX_CHANNEL_COUNT),
    _BYTES_PER_DECODED_SAMPLE,
)

DEFAULT_AUDIO_RESOURCE_POLICY = AudioResourcePolicy(
    version=AUDIO_RESOURCE_POLICY_VERSION,
    max_encoded_file_bytes=100 * 1024 * 1024,
    max_duration_seconds=float(_MAX_DURATION_SECONDS),
    min_duration_seconds=0.05,
    min_source_sampling_rate_hz=8_000,
    max_source_sampling_rate_hz=192_000,
    target_sampling_rate_hz=_TARGET_SAMPLING_RATE_HZ,
    min_channel_count=1,
    max_channel_count=_MAX_CHANNEL_COUNT,
    max_decoded_sample_count=_MAX_DECODED_SAMPLE_COUNT,
    bytes_per_decoded_sample=_BYTES_PER_DECODED_SAMPLE,
    max_decoded_memory_bytes=_MAX_DECODED_MEMORY_BYTES,
)

MAX_ENCODED_FILE_BYTES = DEFAULT_AUDIO_RESOURCE_POLICY.max_encoded_file_bytes
MAX_DURATION_SECONDS = DEFAULT_AUDIO_RESOURCE_POLICY.max_duration_seconds
TARGET_SAMPLING_RATE_HZ = DEFAULT_AUDIO_RESOURCE_POLICY.target_sampling_rate_hz
MAX_DECODED_SAMPLE_COUNT = DEFAULT_AUDIO_RESOURCE_POLICY.max_decoded_sample_count


def _require_finite_number(value: object) -> float:
    """Return a finite float or fail closed on malformed metadata."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _raise("non_finite_metadata")
    number = float(value)
    if not np.isfinite(number):
        _raise("non_finite_metadata")
    return number


def estimate_decoded_memory_bytes(
    sample_count: int,
    channel_count: int,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> int:
    """Return the float32 memory estimate for one decoded buffer, checked for overflow."""
    per_frame = _checked_int_product(channel_count, policy.bytes_per_decoded_sample)
    return _checked_int_product(sample_count, per_frame)


def validate_encoded_file_bytes(
    file_size: object,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject encoded sizes that are missing, non-finite, empty, or over budget."""
    size = _require_finite_number(file_size)
    if size != int(size) or size < 0:
        _raise("non_finite_metadata")
    if int(size) == 0:
        _raise("malformed_header")
    if int(size) > policy.max_encoded_file_bytes:
        _raise("encoded_file_too_large")


def validate_duration_seconds(
    duration_seconds: object,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject durations that are missing, non-finite, too short, or too long."""
    duration = _require_finite_number(duration_seconds)
    if duration < policy.min_duration_seconds:
        _raise("duration_too_short")
    if duration > policy.max_duration_seconds:
        _raise("duration_exceeded")


def validate_source_sampling_rate(
    sampling_rate_hz: object,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject sampling rates outside the supported rehearsal recording range."""
    rate = _require_finite_number(sampling_rate_hz)
    if rate != int(rate) or rate <= 0:
        _raise("sampling_rate_unsupported")
    hz = int(rate)
    if hz < policy.min_source_sampling_rate_hz or hz > policy.max_source_sampling_rate_hz:
        _raise("sampling_rate_unsupported")


def validate_channel_count(
    channel_count: object,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject channel counts outside the mono/stereo rehearsal policy."""
    count = _require_finite_number(channel_count)
    if count != int(count):
        _raise("channel_count_unsupported")
    channels = int(count)
    if channels < policy.min_channel_count or channels > policy.max_channel_count:
        _raise("channel_count_unsupported")


def _array_layout(audio: np.ndarray) -> tuple[int, int]:
    """Return ``(channel_count, sample_count)`` for a 1-D or 2-D decoded buffer."""
    if audio.ndim == 1:
        return 1, int(audio.size)
    if audio.ndim == 2:
        first, second = int(audio.shape[0]), int(audio.shape[1])
        if first <= 4 and second >= first:
            return first, second
        return second, first
    raise AudioResourcePolicyError("malformed_header", POLICY_MESSAGES["malformed_header"])


def validate_decoded_audio(
    audio: object,
    sampling_rate_hz: object,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Revalidate decoded samples because container metadata is untrusted."""
    if not isinstance(audio, np.ndarray) or audio.dtype.kind not in "fiu":
        _raise("malformed_header")
    if audio.size == 0:
        _raise("duration_too_short")
    if not np.isfinite(audio).all():
        _raise("malformed_header")
    validate_source_sampling_rate(sampling_rate_hz, policy)
    channel_count, sample_count = _array_layout(audio)
    validate_channel_count(channel_count, policy)
    if sample_count > policy.max_decoded_sample_count:
        _raise("decoded_sample_count_exceeded")
    rate = int(_require_finite_number(sampling_rate_hz))
    duration = float(sample_count) / float(rate)
    validate_duration_seconds(duration, policy)
    memory_bytes = estimate_decoded_memory_bytes(sample_count, channel_count, policy)
    if memory_bytes > policy.max_decoded_memory_bytes:
        _raise("memory_budget_exceeded")
