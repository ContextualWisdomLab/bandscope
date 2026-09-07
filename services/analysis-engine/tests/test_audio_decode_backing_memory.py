"""Resource regressions for decoder-returned NumPy backing allocations."""

from __future__ import annotations

import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import AudioResourcePolicy


def test_decode_detaches_admitted_view_from_oversized_backing_array(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return bounded owned PCM even when the decoder exposes a non-owning view."""
    policy = AudioResourcePolicy(
        target_sample_rate=8,
        max_duration_seconds=1.0,
        max_decoded_audio_bytes=16,
    )
    backing = np.array([0.1, -0.2, 0.3, -0.4] + [0.0] * 28, dtype=np.float32)
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

    decoded, sample_rate = audio_decode.decode_mono_audio(io.BytesIO(b"container"), policy=policy)

    np.testing.assert_array_equal(decoded, decoded_view)
    assert decoded.flags.owndata is True
    assert not np.shares_memory(decoded, backing)
    assert decoded.nbytes == policy.max_decoded_audio_bytes
    assert sample_rate == policy.target_sample_rate
