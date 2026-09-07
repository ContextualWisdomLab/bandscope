"""Regression tests for decoder-output allocation before PCM normalization."""

from __future__ import annotations

import io
from collections.abc import Callable
from typing import Any

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)


def _reject_float32_copy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail if an over-budget decoder result is copied into canonical float32 PCM."""
    original_array: Callable[..., np.ndarray[Any, Any]] = audio_decode.np.array

    def guarded_array(value: object, *args: object, **kwargs: object) -> np.ndarray[Any, Any]:
        requested_dtype = kwargs.get("dtype")
        if requested_dtype is None and args:
            requested_dtype = args[0]
        if requested_dtype is not None and np.dtype(requested_dtype) == np.dtype(np.float32):
            pytest.fail("over-budget decoder output must be rejected before float32 normalization")
        return original_array(value, *args, **kwargs)

    monkeypatch.setattr(audio_decode.np, "array", guarded_array)


def test_decode_rejects_sample_overflow_before_float32_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An oversized decoder result must not trigger a second canonical-buffer allocation."""
    decoder_output = np.zeros(3, dtype=np.float64)
    policy = AudioResourcePolicy(target_sample_rate=2, max_duration_seconds=1.0)
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (decoder_output, policy.target_sample_rate),
    )
    _reject_float32_copy(monkeypatch)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    assert caught.value.reason == "decoded_sample_count_exceeded"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION


def test_decode_rejects_intermediate_memory_overflow_before_float32_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A wide decoder buffer above the byte budget must fail before normalization copies it."""
    decoder_output = np.zeros(3, dtype=np.float64)
    policy = AudioResourcePolicy(
        target_sample_rate=3,
        max_duration_seconds=1.0,
        max_decoded_audio_bytes=16,
    )
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (decoder_output, policy.target_sample_rate),
    )
    _reject_float32_copy(monkeypatch)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    assert caught.value.reason == "memory_budget_exceeded"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION


def test_decode_rejects_canonical_float32_expansion_before_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Budget the future canonical float32 allocation, not only the decoder view."""
    decoder_output = np.zeros(8, dtype=np.float16)
    policy = AudioResourcePolicy(
        target_sample_rate=8,
        max_duration_seconds=1.0,
        max_decoded_audio_bytes=16,
    )
    assert decoder_output.nbytes == policy.max_decoded_audio_bytes
    assert decoder_output.size * np.dtype(np.float32).itemsize > policy.max_decoded_audio_bytes
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (decoder_output, policy.target_sample_rate),
    )
    _reject_float32_copy(monkeypatch)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    assert caught.value.reason == "memory_budget_exceeded"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION


def test_decode_maps_canonical_copy_memory_error_to_budget_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Allocator exhaustion must preserve the stable resource-policy failure contract."""
    decoder_output = np.zeros(2, dtype=np.float64)
    policy = AudioResourcePolicy(
        target_sample_rate=2,
        max_duration_seconds=1.0,
        max_decoded_audio_bytes=16,
    )
    allocation_error = MemoryError("simulated allocator pressure")
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (decoder_output, policy.target_sample_rate),
    )

    def exhausted_array(*_args: object, **_kwargs: object) -> np.ndarray[Any, Any]:
        raise allocation_error

    monkeypatch.setattr(audio_decode.np, "array", exhausted_array)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    assert caught.value.reason == "memory_budget_exceeded"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
    assert caught.value.__cause__ is allocation_error


def test_decode_maps_array_materialization_memory_error_to_malformed_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pre-canonical materialization failure must not masquerade as a budget rejection."""
    policy = AudioResourcePolicy(target_sample_rate=2, max_duration_seconds=1.0)
    materialization_error = MemoryError("simulated pre-canonical materialization pressure")
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: ([0.0, 0.0], policy.target_sample_rate),
    )

    def exhausted_asarray(*_args: object, **_kwargs: object) -> np.ndarray[Any, Any]:
        raise materialization_error

    monkeypatch.setattr(audio_decode.np, "asarray", exhausted_asarray)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    assert caught.value.reason == "malformed_header"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
    assert caught.value.__cause__ is materialization_error
