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

    def __init__(self, rejection_reason: str, safe_message: str) -> None:
        """Record the stable rejection reason together with operator-safe copy."""
        super().__init__(safe_message)
        self.rejection_reason = rejection_reason
        self.safe_message = safe_message
        self.policy_version = AUDIO_RESOURCE_POLICY_VERSION


@dataclass(frozen=True)
class AudioResourcePolicy:
    """Versioned bounds shared by desktop intake, IPC, orchestration, and analyzers."""

    policy_version: int
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


def policy_rejection_message(rejection_reason: str) -> str:
    """Return payload-free copy that names the next rehearsal action."""
    try:
        return POLICY_MESSAGES[rejection_reason]
    except KeyError as catalog_error:
        raise AudioResourcePolicyError(
            "malformed_header", POLICY_MESSAGES["malformed_header"]
        ) from catalog_error


def _raise_policy_rejection(rejection_reason: str) -> NoReturn:
    """Fail closed with the stable rejection reason and payload-free copy."""
    raise AudioResourcePolicyError(
        rejection_reason, policy_rejection_message(rejection_reason)
    )


def _checked_int_product(left_operand: int, right_operand: int) -> int:
    """Multiply two non-negative integers or fail closed on overflow."""
    if left_operand < 0 or right_operand < 0:
        _raise_policy_rejection("integer_overflow")
    if (
        left_operand != 0
        and right_operand > _MAX_SAFE_PRODUCT // left_operand
    ):
        _raise_policy_rejection("integer_overflow")
    return left_operand * right_operand


_MAX_DECODED_SAMPLE_COUNT = _checked_int_product(
    _MAX_DURATION_SECONDS, _TARGET_SAMPLING_RATE_HZ
)
_MAX_DECODED_MEMORY_BYTES = _checked_int_product(
    _checked_int_product(_MAX_DECODED_SAMPLE_COUNT, _MAX_CHANNEL_COUNT),
    _BYTES_PER_DECODED_SAMPLE,
)

DEFAULT_AUDIO_RESOURCE_POLICY = AudioResourcePolicy(
    policy_version=AUDIO_RESOURCE_POLICY_VERSION,
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


def _require_finite_number(numeric_value: object) -> float:
    """Return a finite float or fail closed on malformed metadata."""
    if isinstance(numeric_value, bool) or not isinstance(numeric_value, (int, float)):
        _raise_policy_rejection("non_finite_metadata")
    try:
        finite_number = float(numeric_value)
    except (OverflowError, TypeError, ValueError):
        _raise_policy_rejection("non_finite_metadata")
    if not np.isfinite(finite_number):
        _raise_policy_rejection("non_finite_metadata")
    return finite_number


def estimate_decoded_memory_bytes(
    sample_count: int,
    channel_count: int,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> int:
    """Return the float32 memory estimate for one decoded buffer, checked for overflow."""
    bytes_per_audio_frame = _checked_int_product(
        channel_count, audio_resource_policy.bytes_per_decoded_sample
    )
    return _checked_int_product(sample_count, bytes_per_audio_frame)


def validate_encoded_file_bytes(
    file_size_bytes: object,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject encoded sizes that are missing, non-finite, empty, or over budget."""
    normalized_file_size = _require_finite_number(file_size_bytes)
    if normalized_file_size != int(normalized_file_size) or normalized_file_size < 0:
        _raise_policy_rejection("non_finite_metadata")
    if int(normalized_file_size) == 0:
        _raise_policy_rejection("malformed_header")
    if int(normalized_file_size) > audio_resource_policy.max_encoded_file_bytes:
        _raise_policy_rejection("encoded_file_too_large")


def validate_duration_seconds(
    duration_seconds: object,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject durations that are missing, non-finite, too short, or too long."""
    normalized_duration_seconds = _require_finite_number(duration_seconds)
    if normalized_duration_seconds < audio_resource_policy.min_duration_seconds:
        _raise_policy_rejection("duration_too_short")
    if normalized_duration_seconds > audio_resource_policy.max_duration_seconds:
        _raise_policy_rejection("duration_exceeded")


def validate_source_sampling_rate(
    sampling_rate_hz: object,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject sampling rates outside the supported rehearsal recording range."""
    normalized_sampling_rate = _require_finite_number(sampling_rate_hz)
    if (
        normalized_sampling_rate != int(normalized_sampling_rate)
        or normalized_sampling_rate <= 0
    ):
        _raise_policy_rejection("sampling_rate_unsupported")
    sampling_rate_integer_hz = int(normalized_sampling_rate)
    if (
        sampling_rate_integer_hz < audio_resource_policy.min_source_sampling_rate_hz
        or sampling_rate_integer_hz > audio_resource_policy.max_source_sampling_rate_hz
    ):
        _raise_policy_rejection("sampling_rate_unsupported")


def validate_channel_count(
    channel_count: object,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Reject channel counts outside the mono/stereo rehearsal policy."""
    normalized_channel_count = _require_finite_number(channel_count)
    if normalized_channel_count != int(normalized_channel_count):
        _raise_policy_rejection("channel_count_unsupported")
    channel_count_integer = int(normalized_channel_count)
    if (
        channel_count_integer < audio_resource_policy.min_channel_count
        or channel_count_integer > audio_resource_policy.max_channel_count
    ):
        _raise_policy_rejection("channel_count_unsupported")


def _decoded_audio_layout(decoded_audio: np.ndarray) -> tuple[int, int]:
    """Return ``(channel_count, sample_count)`` for a 1-D or 2-D decoded buffer."""
    if decoded_audio.ndim == 1:
        return 1, int(decoded_audio.size)
    if decoded_audio.ndim == 2:
        first_axis_size = int(decoded_audio.shape[0])
        second_axis_size = int(decoded_audio.shape[1])
        if first_axis_size <= 4 and second_axis_size >= first_axis_size:
            return first_axis_size, second_axis_size
        return second_axis_size, first_axis_size
    raise AudioResourcePolicyError(
        "malformed_header", POLICY_MESSAGES["malformed_header"]
    )


def validate_decoded_audio(
    decoded_audio: object,
    sampling_rate_hz: object,
    audio_resource_policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> None:
    """Revalidate decoded samples because container metadata is untrusted."""
    if not isinstance(decoded_audio, np.ndarray) or decoded_audio.dtype.kind not in "fiu":
        _raise_policy_rejection("malformed_header")
    if decoded_audio.size == 0:
        _raise_policy_rejection("duration_too_short")
    if not np.isfinite(decoded_audio).all():
        _raise_policy_rejection("malformed_header")
    validate_source_sampling_rate(sampling_rate_hz, audio_resource_policy)
    channel_count, sample_count = _decoded_audio_layout(decoded_audio)
    validate_channel_count(channel_count, audio_resource_policy)
    if sample_count > audio_resource_policy.max_decoded_sample_count:
        _raise_policy_rejection("decoded_sample_count_exceeded")
    sample_rate_integer_hz = int(_require_finite_number(sampling_rate_hz))
    decoded_duration_seconds = float(sample_count) / float(sample_rate_integer_hz)
    validate_duration_seconds(decoded_duration_seconds, audio_resource_policy)
    decoded_memory_bytes = estimate_decoded_memory_bytes(
        sample_count, channel_count, audio_resource_policy
    )
    if decoded_memory_bytes > audio_resource_policy.max_decoded_memory_bytes:
        _raise_policy_rejection("memory_budget_exceeded")
