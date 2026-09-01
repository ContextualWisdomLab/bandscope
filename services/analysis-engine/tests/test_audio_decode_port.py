from __future__ import annotations

import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicyError,
    policy_rejection_message,
)


def test_decode_mono_audio_preflights_then_validates_one_owned_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = io.BytesIO(b"container")
    calls: list[tuple[str, object]] = []
    decoder_output = np.array([[0.25, -0.5]], dtype=np.float64)

    def preflight(candidate: object, policy: object) -> None:
        calls.append(("preflight", candidate))
        assert policy is DEFAULT_AUDIO_RESOURCE_POLICY

    def load(candidate: object, **kwargs: object) -> tuple[np.ndarray, int]:
        calls.append(("decode", candidate))
        assert candidate is source
        assert kwargs == {"sr": 44_100, "mono": True, "duration": 12.5}
        return decoder_output, 44_100

    def validate(decoded: object, sample_rate: object, policy: object) -> None:
        calls.append(("validate", decoded))
        assert isinstance(decoded, np.ndarray)
        assert decoded.dtype == np.float32
        assert decoded.shape == (2,)
        assert sample_rate == 44_100
        assert policy is DEFAULT_AUDIO_RESOURCE_POLICY

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", preflight)
    monkeypatch.setattr(audio_decode.librosa, "load", load)
    monkeypatch.setattr(audio_decode, "validate_decoded_audio", validate)

    decoded, sample_rate = audio_decode.decode_mono_audio(
        source,
        target_sample_rate_hz=44_100,
        max_duration_seconds=12.5,
    )

    assert calls[0] == ("preflight", source)
    assert calls[1] == ("decode", source)
    assert calls[2][0] == "validate"
    np.testing.assert_array_equal(decoded, np.array([0.25, -0.5], dtype=np.float32))
    assert sample_rate == 44_100


def test_decode_mono_audio_preserves_resource_policy_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rejection = AudioResourcePolicyError(
        "duration_exceeded", policy_rejection_message("duration_exceeded")
    )

    def reject(_source: object, _policy: object) -> None:
        raise rejection

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", reject)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: pytest.fail("decoder must not run after rejected preflight"),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught.value is rejection


def test_decode_mono_audio_redacts_third_party_decoder_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret_detail = "/Users/alice/Music/private.m4a token=secret"
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(secret_detail)),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught.value.reason == "malformed_header"
    assert str(caught.value) == policy_rejection_message("malformed_header")
    assert secret_detail not in str(caught.value)
    assert isinstance(caught.value.__cause__, RuntimeError)


def test_decode_mono_audio_redacts_malformed_decoder_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: ([object()], 44_100),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught.value.reason == "malformed_header"
    assert str(caught.value) == policy_rejection_message("malformed_header")


def test_decode_mono_audio_preserves_decoded_policy_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rejection = AudioResourcePolicyError(
        "duration_too_short", policy_rejection_message("duration_too_short")
    )
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (np.array([0.1], dtype=np.float32), 44_100),
    )
    monkeypatch.setattr(
        audio_decode,
        "validate_decoded_audio",
        lambda *_args: (_ for _ in ()).throw(rejection),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught.value is rejection
