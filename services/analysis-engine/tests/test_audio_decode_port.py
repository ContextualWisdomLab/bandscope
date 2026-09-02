from __future__ import annotations

import inspect
import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicyError,
    policy_rejection_message,
)


def test_decode_mono_audio_uses_semantic_public_parameter_names() -> None:
    parameter_names = tuple(inspect.signature(audio_decode.decode_mono_audio).parameters)

    assert parameter_names == (
        "audio_source",
        "target_sample_rate_hz",
        "max_duration_seconds",
        "audio_resource_policy",
    )


def test_decode_mono_audio_preflights_then_validates_one_owned_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    audio_source = io.BytesIO(b"container")
    decode_calls: list[tuple[str, object]] = []
    decoder_output = np.array([[0.25, -0.5]], dtype=np.float64)

    def preflight_audio_source(
        audio_candidate: object, audio_resource_policy: object
    ) -> None:
        decode_calls.append(("preflight", audio_candidate))
        assert audio_resource_policy is DEFAULT_AUDIO_RESOURCE_POLICY

    def load_audio_container(
        audio_candidate: object, **loader_options: object
    ) -> tuple[np.ndarray, int]:
        decode_calls.append(("decode", audio_candidate))
        assert audio_candidate is audio_source
        assert loader_options == {"sr": 44_100, "mono": True, "duration": 12.5}
        return decoder_output, 44_100

    def validate_audio_buffer(
        decoded_audio: object, sample_rate_hz: object, audio_resource_policy: object
    ) -> None:
        decode_calls.append(("validate", decoded_audio))
        assert isinstance(decoded_audio, np.ndarray)
        assert decoded_audio.dtype == np.float32
        assert decoded_audio.shape == (2,)
        assert sample_rate_hz == 44_100
        assert audio_resource_policy is DEFAULT_AUDIO_RESOURCE_POLICY

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", preflight_audio_source)
    monkeypatch.setattr(audio_decode.librosa, "load", load_audio_container)
    monkeypatch.setattr(audio_decode, "validate_decoded_audio", validate_audio_buffer)

    decoded_audio, sample_rate_hz = audio_decode.decode_mono_audio(
        audio_source,
        target_sample_rate_hz=44_100,
        max_duration_seconds=12.5,
    )

    assert decode_calls[0] == ("preflight", audio_source)
    assert decode_calls[1] == ("decode", audio_source)
    assert decode_calls[2][0] == "validate"
    np.testing.assert_array_equal(
        decoded_audio, np.array([0.25, -0.5], dtype=np.float32)
    )
    assert sample_rate_hz == 44_100


def test_decode_mono_audio_preserves_resource_policy_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resource_rejection = AudioResourcePolicyError(
        "duration_exceeded", policy_rejection_message("duration_exceeded")
    )

    def reject_audio_source(_audio_source: object, _audio_resource_policy: object) -> None:
        raise resource_rejection

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", reject_audio_source)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: pytest.fail("decoder must not run after rejected preflight"),
    )

    with pytest.raises(AudioResourcePolicyError) as caught_error:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught_error.value is resource_rejection


def test_decode_mono_audio_redacts_third_party_decoder_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret_decoder_detail = "/Users/alice/Music/private.m4a token=secret"
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError(secret_decoder_detail)
        ),
    )

    with pytest.raises(AudioResourcePolicyError) as caught_error:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught_error.value.reason == "malformed_header"
    assert str(caught_error.value) == policy_rejection_message("malformed_header")
    assert secret_decoder_detail not in str(caught_error.value)
    assert isinstance(caught_error.value.__cause__, RuntimeError)


def test_decode_mono_audio_redacts_malformed_decoder_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: ([object()], 44_100),
    )

    with pytest.raises(AudioResourcePolicyError) as caught_error:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught_error.value.reason == "malformed_header"
    assert str(caught_error.value) == policy_rejection_message("malformed_header")


def test_decode_mono_audio_preserves_decoded_policy_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resource_rejection = AudioResourcePolicyError(
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
        lambda *_args: (_ for _ in ()).throw(resource_rejection),
    )

    with pytest.raises(AudioResourcePolicyError) as caught_error:
        audio_decode.decode_mono_audio(
            io.BytesIO(b"container"),
            target_sample_rate_hz=44_100,
            max_duration_seconds=10.0,
        )

    assert caught_error.value is resource_rejection
