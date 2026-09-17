"""Consumer-integrity policy for admitted MIR corpus material."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import BinaryIO

import pytest

from test_structure_corpus_admission import (
    _admission,
    _digest,
    _files,
    _manifest,
    _registration,
    _runtime,
)


def test_consumer_cannot_mutate_admitted_annotation_without_detection(
    tmp_path: Path,
) -> None:
    """Receipt admission must fail if a consumer mutates the hashed annotation snapshot."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
    pcm = memoryview(b"\x00\x00\x00\x00")

    def fake_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        return hashlib.sha256(pcm).hexdigest(), 1, pcm

    def mutating_consumer(
        _track_id: str,
        _pcm: memoryview,
        annotation_snapshot: BinaryIO,
        _sample_rate_hz: int,
    ) -> None:
        annotation_snapshot.seek(0)
        annotation_snapshot.write(b"tampered-after-admission")
        annotation_snapshot.truncate()
        annotation_snapshot.flush()

    with pytest.raises(ValueError, match="consumer mutated admitted annotation"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=_runtime(),
            decoder=fake_decoder,
            track_consumer=mutating_consumer,
        )
