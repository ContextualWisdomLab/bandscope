"""Organization naming-contract regressions for the audio resource policy."""

from __future__ import annotations

import inspect
from dataclasses import fields

import pytest

from bandscope_analysis.audio_resource_policy import (
    AudioResourcePolicy,
    AudioResourcePolicyError,
    estimate_decoded_memory_bytes,
    policy_rejection_message,
    validate_channel_count,
    validate_decoded_audio,
    validate_duration_seconds,
    validate_encoded_file_bytes,
    validate_source_sampling_rate,
)


def test_audio_resource_policy_uses_semantic_owned_field_names() -> None:
    """Persist no generic one-word field in the new policy value object."""
    policy_field_names = tuple(policy_field.name for policy_field in fields(AudioResourcePolicy))

    assert policy_field_names[0] == "policy_version"
    assert "version" not in policy_field_names


def test_audio_resource_policy_error_uses_semantic_owned_attributes() -> None:
    """Expose semantic rejection provenance rather than generic reason/message fields."""
    policy_error = AudioResourcePolicyError("malformed_header", "safe copy")

    assert policy_error.rejection_reason == "malformed_header"
    assert policy_error.safe_message == "safe copy"
    assert not hasattr(policy_error, "reason")
    assert not hasattr(policy_error, "message")


@pytest.mark.parametrize(
    ("policy_function", "expected_parameters"),
    [
        (policy_rejection_message, ("rejection_reason",)),
        (
            estimate_decoded_memory_bytes,
            ("sample_count", "channel_count", "audio_resource_policy"),
        ),
        (
            validate_encoded_file_bytes,
            ("file_size_bytes", "audio_resource_policy"),
        ),
        (
            validate_duration_seconds,
            ("duration_seconds", "audio_resource_policy"),
        ),
        (
            validate_source_sampling_rate,
            ("sampling_rate_hz", "audio_resource_policy"),
        ),
        (
            validate_channel_count,
            ("channel_count", "audio_resource_policy"),
        ),
        (
            validate_decoded_audio,
            ("decoded_audio", "sampling_rate_hz", "audio_resource_policy"),
        ),
    ],
)
def test_audio_resource_policy_public_functions_use_semantic_parameter_names(
    policy_function: object,
    expected_parameters: tuple[str, ...],
) -> None:
    """Keep organization-owned public function parameters bounded-context specific."""
    parameter_names = tuple(inspect.signature(policy_function).parameters)

    assert parameter_names == expected_parameters
