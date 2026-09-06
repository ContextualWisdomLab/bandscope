"""Regression contracts for admitted local-audio byte continuity."""

from __future__ import annotations

import hashlib

import numpy as np
import pytest

import bandscope_analysis.separation.audio_separator as audio_separator_module
from bandscope_analysis.separation.audio_separator import AudioSeparationConfig, AudioStemSeparator


def _same_size_bytes(seed: bytes, marker: int) -> bytes:
    """Return a byte-distinct payload with the same encoded length."""
    payload = bytearray(seed)
    payload[-1] = marker
    return bytes(payload)


def _separator() -> AudioStemSeparator:
    """Build the bounded separator used by the byte-continuity regressions."""
    return AudioStemSeparator(
        AudioSeparationConfig(target_sample_rate=8_000, max_file_bytes=1_000_000)
    )


def test_admitted_separator_rejects_same_size_replacement_before_decode(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reject a pathname replacement that no longer matches native content evidence."""
    original = b"RIFF-admitted-audio"
    replacement = _same_size_bytes(original, ord("X"))
    audio_path = tmp_path / "source.wav"
    audio_path.write_bytes(replacement)
    decode_called = False

    def fake_decode(*_args, **_kwargs):
        nonlocal decode_called
        decode_called = True
        return np.ones(8, dtype=np.float32), 8_000

    monkeypatch.setattr(audio_separator_module, "decode_mono_audio", fake_decode)

    with pytest.raises(ValueError, match="source changed before decode"):
        _separator().separate_admitted(
            audio_path,
            expected_file_size_bytes=len(original),
            expected_content_sha256=hashlib.sha256(original).hexdigest(),
        )

    assert decode_called is False


def test_admitted_separator_decodes_verified_snapshot_after_path_replacement(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Decode the verified snapshot even if the pathname changes after snapshotting."""
    original = b"RIFF-admitted-audio"
    replacement = _same_size_bytes(original, ord("Y"))
    audio_path = tmp_path / "source.wav"
    audio_path.write_bytes(original)
    observed_decode_bytes: bytes | None = None

    def fake_decode(source, *, policy):
        nonlocal observed_decode_bytes
        audio_path.write_bytes(replacement)
        source.seek(0)
        observed_decode_bytes = source.read()
        return np.ones(8, dtype=np.float32), policy.target_sample_rate

    monkeypatch.setattr(audio_separator_module, "decode_mono_audio", fake_decode)
    monkeypatch.setattr(
        AudioStemSeparator,
        "_separate_signal",
        lambda _self, audio, _sample_rate: {
            "vocals": np.zeros(audio.size, dtype=np.float32),
            "bass": np.zeros(audio.size, dtype=np.float32),
            "drums": np.zeros(audio.size, dtype=np.float32),
            "other": np.zeros(audio.size, dtype=np.float32),
        },
    )

    _separator().separate_admitted(
        audio_path,
        expected_file_size_bytes=len(original),
        expected_content_sha256=hashlib.sha256(original).hexdigest(),
    )

    assert observed_decode_bytes == original
    assert audio_path.read_bytes() == replacement


def test_plain_separator_consumes_scoped_native_evidence(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Require the production worker entrypoint to honor native admission evidence."""
    original = b"RIFF-admitted-audio"
    audio_path = tmp_path / "source.wav"
    audio_path.write_bytes(_same_size_bytes(original, ord("Z")))
    decode_called = False

    def fake_decode(*_args, **_kwargs):
        nonlocal decode_called
        decode_called = True
        return np.ones(8, dtype=np.float32), 8_000

    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", str(len(original)))
    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", hashlib.sha256(original).hexdigest())
    monkeypatch.setattr(audio_separator_module, "decode_mono_audio", fake_decode)
    monkeypatch.setattr(
        AudioStemSeparator,
        "_separate_signal",
        lambda _self, audio, _sample_rate: {
            "vocals": np.zeros(audio.size, dtype=np.float32),
            "bass": np.zeros(audio.size, dtype=np.float32),
            "drums": np.zeros(audio.size, dtype=np.float32),
            "other": np.zeros(audio.size, dtype=np.float32),
        },
    )

    with pytest.raises(ValueError, match="source changed before decode"):
        _separator().separate(audio_path)

    assert decode_called is False


def test_plain_separator_rejects_partial_native_evidence(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fail closed when a child process receives only half of native evidence."""
    audio_path = tmp_path / "source.wav"
    audio_path.write_bytes(b"RIFF-admitted-audio")
    decode_called = False

    def fake_decode(*_args, **_kwargs):
        nonlocal decode_called
        decode_called = True
        return np.ones(8, dtype=np.float32), 8_000

    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", str(audio_path.stat().st_size))
    monkeypatch.delenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", raising=False)
    monkeypatch.setattr(audio_separator_module, "decode_mono_audio", fake_decode)

    with pytest.raises(ValueError, match="source changed before decode"):
        _separator().separate(audio_path)

    assert decode_called is False
