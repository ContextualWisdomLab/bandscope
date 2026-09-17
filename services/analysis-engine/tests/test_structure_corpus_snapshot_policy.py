"""Snapshot policy for real-audio corpus admission."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from types import ModuleType

from conftest import load_module


def _admission() -> ModuleType:
    return load_module(
        "scripts/research/verify_structure_corpus.py",
        "verify_structure_corpus_snapshot_policy",
    )


def test_admitted_audio_snapshot_is_immutable_against_source_mutation(tmp_path: Path) -> None:
    """Decode input must be the exact bytes hashed at admission, not a live source inode."""
    admission = _admission()
    source = tmp_path / "track.wav"
    original = b"registered-audio-bytes"
    source.write_bytes(original)
    fd = admission._open_regular_file(source, "audio_path")
    try:
        snapshot, digest = admission._snapshot_and_hash(fd)
        try:
            source.write_bytes(b"mutated-after-admission")
            snapshot.seek(0)
            assert snapshot.read() == original
            assert digest == hashlib.sha256(original).hexdigest()
        finally:
            snapshot.close()
    finally:
        os.close(fd)
