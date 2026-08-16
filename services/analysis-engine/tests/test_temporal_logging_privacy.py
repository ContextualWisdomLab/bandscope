"""Regression tests for temporal-analysis logging privacy."""

import logging
from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.temporal import TemporalAnalyzer


def test_temporal_failure_logs_do_not_expose_path_or_dependency_detail(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Unexpected failures should keep local paths and dependency detail out of logs."""
    import librosa

    test_wav = tmp_path / "Alice-session.wav"
    test_wav.write_bytes(b"dummy")
    sensitive_detail = (
        "decoder failed for /private/customer/Alice/session.wav token=super-secret"
    )

    def fake_load(*args: object, **kwargs: object) -> tuple[np.ndarray, int]:
        raise RuntimeError(sensitive_detail)

    monkeypatch.setattr(librosa, "load", fake_load)
    caplog.set_level(logging.INFO, logger="bandscope_analysis.temporal.analyzer")

    with pytest.raises(ValueError, match="Temporal analysis failed"):
        TemporalAnalyzer().analyze(test_wav)

    assert "Temporal analysis failed during local audio processing" in caplog.text
    assert str(test_wav) not in caplog.text
    assert sensitive_detail not in caplog.text
    assert "super-secret" not in caplog.text
