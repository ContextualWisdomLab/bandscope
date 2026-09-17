"""Consumer-integrity policy for admitted MIR corpus material."""

from __future__ import annotations

import hashlib
import os
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


def test_consumer_receives_intrinsically_read_only_annotation_bytes(
    tmp_path: Path,
) -> None:
    """A consumer must not be able to mutate annotation evidence then restore it."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
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

    assert consumed_annotations == [path.read_bytes() for path in annotation_paths]
    assert [track["annotation_sha256"] for track in receipt["tracks"]] == [
        _digest(path) for path in annotation_paths
    ]
