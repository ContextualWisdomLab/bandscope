"""Contract tests for the canonical local-audio decode port.

These regressions keep resource admission, decoder failure redaction, and
decoded-output validation behind one owned boundary.
"""

from __future__ import annotations

import io

import numpy as np
import pytest

from bandscope_analysis import audio_decode
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)


def test_decode_mono_audio_rejects_encoded_size_before_metadata_or_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject an oversized encoded handle before parser or decoder work begins."""
    source = io.BytesIO(b"oversized")
    policy = AudioResourcePolicy(max_encoded_file_bytes=len(source.getvalue()) - 1)
    monkeypatch.setattr(
        audio_decode,
        "preflight_audio_metadata",
        lambda *_args: pytest.fail("metadata parser must not run for oversized encoded input"),
    )
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: pytest.fail("decoder must not run for oversized encoded input"),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(source, policy=policy)

    assert caught.value.reason == "encoded_file_too_large"
    assert source.tell() == 0


def test_decode_mono_audio_redacts_encoded_size_probe_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A handle that cannot expose a stable encoded size fails before parsing."""

    class SizeProbeFails(io.BytesIO):
        """Reject size inspection while retaining an otherwise readable handle."""

        def tell(self) -> int:
            """Simulate a local I/O failure without leaking its detail."""
            raise OSError("/private/rehearsal/source.wav size probe failed")

    monkeypatch.setattr(
        audio_decode,
        "preflight_audio_metadata",
        lambda *_args: pytest.fail("metadata parser must not run after size-probe failure"),
    )
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: pytest.fail("decoder must not run after size-probe failure"),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(SizeProbeFails(b"container"))

    assert caught.value.reason == "malformed_header"
    assert "/private/rehearsal/source.wav" not in str(caught.value)
    assert isinstance(caught.value.__cause__, OSError)


def test_decode_mono_audio_preflights_then_validates_one_owned_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep preflight, one decode, and decoded validation in strict order.

    The decode port must own the sequence so downstream analyzers cannot
    bypass or duplicate resource admission.
    """
    source = io.BytesIO(b"container")
    calls: list[tuple[str, object]] = []
    decoder_output = np.array([0.25, -0.5], dtype=np.float64)
    admitted_source: object | None = None

    def preflight(candidate: object, policy: object) -> None:
        nonlocal admitted_source
        calls.append(("preflight", candidate))
        assert policy is DEFAULT_AUDIO_RESOURCE_POLICY
        assert candidate is not source
        admitted_source = candidate

    def load(candidate: object, **kwargs: object) -> tuple[np.ndarray, int]:
        calls.append(("decode", candidate))
        assert candidate is admitted_source
        assert kwargs == {
            "sr": DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate,
            "mono": True,
            "duration": DEFAULT_AUDIO_RESOURCE_POLICY.decode_probe_duration_seconds,
            "dtype": np.float32,
            "res_type": "soxr_hq",
        }
        return decoder_output, DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate

    def validate(self: AudioResourcePolicy, decoded: object, sample_rate: object) -> np.ndarray:
        calls.append(("validate", decoded))
        assert self is DEFAULT_AUDIO_RESOURCE_POLICY
        assert isinstance(decoded, np.ndarray)
        assert decoded.dtype == np.float32
        assert decoded.shape == (2,)
        assert sample_rate == DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate
        return decoded

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", preflight)
    monkeypatch.setattr(audio_decode.librosa, "load", load)
    monkeypatch.setattr(AudioResourcePolicy, "validate_decoded_audio", validate)

    decoded, sample_rate = audio_decode.decode_mono_audio(
        source,
        policy=DEFAULT_AUDIO_RESOURCE_POLICY,
    )

    assert calls[0][0] == "preflight"
    assert calls[1][0] == "decode"
    assert calls[2][0] == "validate"
    np.testing.assert_array_equal(decoded, np.array([0.25, -0.5], dtype=np.float32))
    assert sample_rate == DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate


def test_decode_mono_audio_bounds_growth_after_encoded_size_admission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not let post-admission source growth expand parser or decoder authority."""

    class GrowsAfterSizeProbe(io.BytesIO):
        """Append bytes exactly when the initial size probe rewinds the source."""

        def __init__(self, initial: bytes, growth: bytes) -> None:
            """Retain deterministic initial and post-probe byte sequences."""
            super().__init__(initial)
            self._growth = growth
            self._grew = False

        def seek(self, offset: int, whence: int = 0) -> int:
            """Grow once after the caller has measured the original end offset."""
            position = super().seek(offset, whence)
            if not self._grew and whence == 0 and offset == 0:
                self._grew = True
                current = super().tell()
                super().seek(0, 2)
                super().write(self._growth)
                super().seek(current)
            return position

    initial = b"container"
    source = GrowsAfterSizeProbe(initial, b"-post-admission-growth")
    policy = AudioResourcePolicy(max_encoded_file_bytes=len(initial))
    admitted_source: object | None = None

    def preflight(candidate: object, _policy: object) -> None:
        nonlocal admitted_source
        admitted_source = candidate
        assert candidate is not source
        assert candidate.read() == initial  # type: ignore[attr-defined]
        candidate.seek(0)  # type: ignore[attr-defined]

    def load(candidate: object, **_kwargs: object) -> tuple[np.ndarray, int]:
        assert candidate is admitted_source
        assert candidate.read() == initial  # type: ignore[attr-defined]
        return (
            np.array([0.1], dtype=np.float32),
            DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate,
        )

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", preflight)
    monkeypatch.setattr(audio_decode.librosa, "load", load)

    decoded, sample_rate = audio_decode.decode_mono_audio(source, policy=policy)

    np.testing.assert_array_equal(decoded, np.array([0.1], dtype=np.float32))
    assert sample_rate == DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate
    assert source.getvalue() == initial + b"-post-admission-growth"


def test_bounded_encoded_source_readinto_stops_at_admitted_eof() -> None:
    """Keep virtual-I/O buffer fills inside the originally admitted byte extent."""
    admitted = b"container"
    source = io.BytesIO(admitted + b"-post-admission-growth")
    bounded = audio_decode._BoundedEncodedSource(source, len(admitted))
    buffer = bytearray(len(admitted) + 8)

    read_count = bounded.readinto(buffer)

    assert read_count == len(admitted)
    assert bytes(buffer[:read_count]) == admitted
    assert bytes(buffer[read_count:]) == b"\x00" * 8
    assert bounded.tell() == len(admitted)
    assert bounded.readinto(buffer) == 0

    bounded.seek(-3, io.SEEK_END)
    tail_buffer = bytearray(8)
    tail_count = bounded.readinto(tail_buffer)
    assert tail_count == 3
    assert bytes(tail_buffer[:tail_count]) == admitted[-3:]
    assert bounded.tell() == len(admitted)


def test_bounded_encoded_source_seek_modes_fail_closed() -> None:
    """Cover the virtual-I/O seek contract without exposing bytes past admitted EOF."""
    admitted = b"abcdef"
    bounded = audio_decode._BoundedEncodedSource(io.BytesIO(admitted + b"extra"), len(admitted))

    assert bounded.readable() is True
    assert bounded.seekable() is True
    assert bounded.seek(2, io.SEEK_SET) == 2
    assert bounded.seek(2, io.SEEK_CUR) == 4
    assert bounded.read(1) == b"e"
    assert bounded.seek(0, io.SEEK_END) == len(admitted)
    assert bounded.read() == b""

    with pytest.raises(ValueError):
        bounded.seek(0, 999)
    with pytest.raises(OSError):
        bounded.seek(-1, io.SEEK_SET)


def test_decode_mono_audio_rejects_non_mono_decoder_shape_before_normalization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject multi-dimensional decoder output instead of flattening channels."""
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (
            np.array([[0.1, 0.2], [0.3, 0.4]], dtype=np.float32),
            DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate,
        ),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value.reason == "malformed_header"


def test_decode_mono_audio_preserves_resource_policy_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Propagate the canonical preflight rejection without invoking a decoder.

    A rejected source must not consume additional decode resources or lose its typed policy reason.
    """
    rejection = AudioResourcePolicyError("duration_exceeded")

    def reject(_source: object, _policy: object) -> None:
        raise rejection

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", reject)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: pytest.fail("decoder must not run after rejected preflight"),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value is rejection


def test_decode_mono_audio_redacts_third_party_decoder_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map third-party decoder details to a payload-safe policy error.

    Native paths or token-shaped details may remain only in the exception
    cause for local debugging, never in buyer-facing error text.
    """
    secret_detail = "/Users/alice/Music/private.m4a token=secret"
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(secret_detail)),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value.reason == "malformed_header"
    assert secret_detail not in str(caught.value)
    assert isinstance(caught.value.__cause__, RuntimeError)


def test_decode_mono_audio_redacts_malformed_decoder_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject decoder output that cannot be normalized into bounded PCM.

    Malformed third-party values must fail at the decode boundary rather than
    escaping into MIR analyzers.
    """
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: ([object()], DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate),
    )

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value.reason == "malformed_header"


def test_decode_mono_audio_preserves_decoded_policy_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Preserve rejection identity from decoded-audio resource validation.

    The decode port must not collapse a precise post-decode budget failure
    into a generic malformed-container error.
    """
    rejection = AudioResourcePolicyError("decoded_sample_count_exceeded")
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (
            np.array([0.1], dtype=np.float32),
            DEFAULT_AUDIO_RESOURCE_POLICY.target_sample_rate,
        ),
    )

    def reject_decoded(
        _self: AudioResourcePolicy, _decoded: object, _sample_rate: object
    ) -> np.ndarray:
        raise rejection

    monkeypatch.setattr(AudioResourcePolicy, "validate_decoded_audio", reject_decoded)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value is rejection
