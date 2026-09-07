"""Resource regressions for decoder-returned NumPy backing allocations."""

from __future__ import annotations

import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import (
    AUDIO_RESOURCE_POLICY_VERSION,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)


def test_decode_rejects_small_view_that_retains_over_budget_backing_array(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not admit a small view that keeps a much larger decoder allocation alive."""
    policy = AudioResourcePolicy(
        target_sample_rate=8,
        max_duration_seconds=1.0,
        max_decoded_audio_bytes=16,
    )
    backing = np.zeros(32, dtype=np.float32)
    decoded_view = backing[:4]
    assert decoded_view.nbytes == policy.max_decoded_audio_bytes
    assert backing.nbytes > policy.max_decoded_audio_bytes
    assert decoded_view.flags.owndata is False

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (decoded_view, policy.target_sample_rate),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    assert caught.value.reason == "memory_budget_exceeded"
    assert caught.value.policy_version == AUDIO_RESOURCE_POLICY_VERSION
