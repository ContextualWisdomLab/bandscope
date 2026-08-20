"""Privacy regressions for analysis-orchestration safe-failure logging."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest

import bandscope_analysis.api as api_module

SENSITIVE_DETAIL = "/Users/Alice/private-rehearsal.wav token=super-secret"


class _ResultQueue:
    """Minimal queue double that records worker result envelopes."""

    def __init__(self) -> None:
        self.items: list[tuple[object, object]] = []

    def put(self, item: tuple[object, object]) -> None:
        """Record one worker result envelope."""
        self.items.append(item)


def _assert_sensitive_payload_absent(caplog: pytest.LogCaptureFixture) -> None:
    """Require routine diagnostics to omit dependency-controlled payloads."""
    assert "/Users/Alice" not in caplog.text
    assert "private-rehearsal.wav" not in caplog.text
    assert "super-secret" not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)


def test_stem_worker_failure_log_is_payload_safe(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Worker failures keep safe results while omitting raw dependency payloads."""

    def _fail_separation(_separator: object, _source_path: str) -> dict[str, object]:
        raise RuntimeError(SENSITIVE_DETAIL)

    monkeypatch.setattr(api_module.AudioStemSeparator, "separate", _fail_separation)
    caplog.set_level(logging.ERROR, logger=api_module.__name__)
    result_queue = _ResultQueue()

    api_module._stem_separation_worker("/tmp/authorized-rehearsal.wav", result_queue)

    assert result_queue.items == [
        ("runtime_error", "Runtime error occurred during stem separation.")
    ]
    assert "Stem separation failed with a runtime error." in caplog.text
    assert "RuntimeError" in caplog.text
    _assert_sensitive_payload_absent(caplog)


def test_job_failure_log_is_payload_safe(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    tmp_path: Path,
) -> None:
    """Job-level safe failures must not log local paths or exception payloads."""

    def _fail_features(_request: api_module.AnalysisJobRequest) -> dict[str, object]:
        raise FileNotFoundError(SENSITIVE_DETAIL)

    monkeypatch.setattr(api_module, "_build_local_audio_features", _fail_features)
    caplog.set_level(logging.ERROR, logger=api_module.__name__)
    source_path = tmp_path / "authorized-rehearsal.wav"
    payload = {
        "sourceKind": "local_audio",
        "sourceLabel": "Authorized rehearsal",
        "roleFocus": [],
        "projectId": "project-privacy-test",
        "localSource": {
            "sourcePath": str(source_path),
            "fileName": source_path.name,
            "extension": "wav",
            "fileSizeBytes": 1,
        },
    }

    updates = api_module.run_analysis_job_updates(
        "job-privacy-test",
        payload,
        "2026-08-20T00:00:00Z",
    )

    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"] == {
        "code": "engine_unavailable",
        "message": "Stem separation failed",
    }
    assert "Stem separation failed before analysis job completion." in caplog.text
    assert "FileNotFoundError" in caplog.text
    _assert_sensitive_payload_absent(caplog)
