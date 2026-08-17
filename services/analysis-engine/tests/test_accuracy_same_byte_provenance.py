"""Same-byte provenance regressions for real-audio accuracy evidence."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.accuracy import (
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    evaluate_c_major_file,
    evaluate_click_tempo_file,
    render_c_major_triad,
    render_click_track,
    write_pcm_wav,
)


def _replace_after_first_read(
    monkeypatch: pytest.MonkeyPatch,
    target: Path,
    replacement_bytes: bytes,
) -> None:
    """Replace ``target`` immediately after its first ``Path.read_bytes`` snapshot."""
    original_read_bytes = Path.read_bytes
    replaced = False

    def read_bytes(path: Path) -> bytes:
        nonlocal replaced
        payload = original_read_bytes(path)
        if path == target and not replaced:
            replaced = True
            path.write_bytes(replacement_bytes)
        return payload

    monkeypatch.setattr(Path, "read_bytes", read_bytes)


def test_c_major_file_scores_the_bytes_that_satisfied_checksum(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Checksum evidence and chord scoring must bind to one immutable byte snapshot."""
    target = tmp_path / "c-major.wav"
    digest = write_pcm_wav(target, render_c_major_triad(), DEFAULT_SAMPLE_RATE)

    replacement = tmp_path / "silence.wav"
    write_pcm_wav(
        replacement,
        np.zeros(DEFAULT_SAMPLE_RATE * 3, dtype=np.float32),
        DEFAULT_SAMPLE_RATE,
    )
    _replace_after_first_read(monkeypatch, target, replacement.read_bytes())

    report = evaluate_c_major_file(target, digest)

    assert report["audio_sha256"] == digest
    assert report["passed"] is True


def test_click_file_scores_the_bytes_that_satisfied_checksum(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Checksum evidence and tempo scoring must bind to one immutable byte snapshot."""
    target = tmp_path / "click.wav"
    digest = write_pcm_wav(
        target,
        render_click_track(bpm=DEFAULT_CLICK_BPM),
        DEFAULT_SAMPLE_RATE,
    )

    replacement = tmp_path / "silence.wav"
    write_pcm_wav(
        replacement,
        np.zeros(DEFAULT_SAMPLE_RATE * 8, dtype=np.float32),
        DEFAULT_SAMPLE_RATE,
    )
    _replace_after_first_read(monkeypatch, target, replacement.read_bytes())

    report = evaluate_click_tempo_file(target, digest, DEFAULT_CLICK_BPM)

    assert report["audio_sha256"] == digest
    assert report["passed"] is True
