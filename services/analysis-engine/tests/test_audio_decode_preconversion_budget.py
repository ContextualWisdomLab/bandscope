"""Regression tests for decoder-output allocation before PCM normalization."""

from __future__ import annotations

import io
from collections.abc import Callable
from typing import Any

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import AudioResourcePolicy, AudioResourcePolicyError


def _reject_float32_copy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail if an over-budget decoder result is copied into canonical float32 PCM."""
    original_asarray: Callable[..., np.ndarray[Any, Any]] = audio_decode.np.asarray

    def guarded_asarray(value: object, *args: object, **kwargs: object) -> np.ndarray[Any, Any]:
        requested_dtype = kwargs.get("dtype")
        if requested_dtype is None and args:
            requested_dtype = args[0]
        if requested_dtype is not None and np.dtype(requested_dtype) == np.dtype(np.float32):
            pytest.fail("over-budget decoder output must be rejected before float32 normalization")
        return original_asarray(value, *args, **kwargs)

    monkeypatch.setattr(audio_decode.np, "asarray", guarded_asarray)


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
