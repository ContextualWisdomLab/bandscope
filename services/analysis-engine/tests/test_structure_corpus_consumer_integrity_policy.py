"""Consumer-integrity policy for admitted MIR corpus material."""

from __future__ import annotations

import hashlib
import os
import struct
from pathlib import Path

import pytest

from test_structure_corpus_admission import (
    _admission,
    _digest,
    _files,
    _manifest,
    _registration,
    _runtime,
)


def _registered_inputs(tmp_path: Path) -> tuple[object, dict[str, object], dict[str, object]]:
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
    return admission, registration, manifest


def test_consumer_receives_intrinsically_read_only_annotation_bytes(
    tmp_path: Path,
) -> None:
    """A consumer must not be able to mutate annotation evidence then restore it."""
    admission, registration, manifest = _registered_inputs(tmp_path)
    pcm = memoryview(b"\x00\x00\x00\x00")
    consumed_annotations: list[bytes] = []

    def fake_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        return hashlib.sha256(pcm).hexdigest(), 1, pcm

    def restoring_attack_consumer(
        _track_id: str,
        _pcm: memoryview,
        annotation_bytes: memoryview,
        _sample_rate_hz: int,
    ) -> None:
        assert annotation_bytes.readonly
        assert isinstance(annotation_bytes.obj, bytes)
        original = bytes(annotation_bytes)
        with pytest.raises(TypeError):
            annotation_bytes[0] = (annotation_bytes[0] + 1) % 256
        assert bytes(annotation_bytes) == original
        consumed_annotations.append(original)

    receipt = admission.verify_corpus(
        registration,
        manifest,
        runtime_identity=_runtime(),
        decoder=fake_decoder,
        track_consumer=restoring_attack_consumer,
    )

    assert len(consumed_annotations) == 2
    assert [track["annotation_sha256"] for track in receipt["tracks"]] == [
        track["annotation_sha256"] for track in registration["corpus"]
    ]


def test_consumer_receives_immutable_pcm_even_if_decoder_exposes_mutable_memory(
    tmp_path: Path,
) -> None:
    """Decoder-owned mutable buffers must not cross the scientific handoff boundary."""
    admission, registration, manifest = _registered_inputs(tmp_path)
    mutable_pcm = memoryview(bytearray(b"\x00\x00\x00\x00"))

    def fake_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        return hashlib.sha256(mutable_pcm).hexdigest(), 1, mutable_pcm

    def mutating_consumer(
        _track_id: str,
        pcm: memoryview,
        _annotation_bytes: memoryview,
        _sample_rate_hz: int,
    ) -> None:
        assert pcm.readonly
        assert isinstance(pcm.obj, bytes)
        with pytest.raises(TypeError):
            pcm[0] = 255

    admission.verify_corpus(
        registration,
        manifest,
        runtime_identity=_runtime(),
        decoder=fake_decoder,
        track_consumer=mutating_consumer,
    )


def test_admission_rejects_decoder_digest_that_does_not_match_handoff_pcm(
    tmp_path: Path,
) -> None:
    """Receipt identity must be recomputed from the exact PCM handed to measurement."""
    admission, registration, manifest = _registered_inputs(tmp_path)
    pcm = memoryview(b"\x00\x00\x00\x00")

    def lying_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        return "0" * 64, 1, pcm

    with pytest.raises(ValueError, match="decoded PCM SHA-256"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=_runtime(),
            decoder=lying_decoder,
            track_consumer=lambda *_args: pytest.fail(
                "consumer must not run when decoder identity is inconsistent"
            ),
        )


def test_admission_rejects_decoder_without_verifiable_pcm(
    tmp_path: Path,
) -> None:
    """A receipt must not trust a decoder-claimed digest without the decoded PCM bytes."""
    admission, registration, manifest = _registered_inputs(tmp_path)

    def digest_only_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        return hashlib.sha256(b"unexposed-pcm").hexdigest(), 1

    with pytest.raises(ValueError, match="decoder must expose admitted PCM"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=_runtime(),
            decoder=digest_only_decoder,
        )


@pytest.mark.parametrize(
    "non_finite_sample",
    [float("nan"), float("inf"), float("-inf")],
)
def test_admission_rejects_non_finite_pcm_before_measurement(
    tmp_path: Path,
    non_finite_sample: float,
) -> None:
    """NaN or infinite decoded samples must never enter MIR measurement."""
    admission, registration, manifest = _registered_inputs(tmp_path)
    pcm = memoryview(struct.pack("<f", non_finite_sample))

    def non_finite_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        return hashlib.sha256(pcm).hexdigest(), 1, pcm

    with pytest.raises(ValueError, match="finite float32"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=_runtime(),
            decoder=non_finite_decoder,
            track_consumer=lambda *_args: pytest.fail(
                "consumer must not run with non-finite PCM"
            ),
        )
