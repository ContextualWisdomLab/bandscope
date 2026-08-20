"""Regression tests for stem-separation worker logging privacy."""

import logging

import pytest

import bandscope_analysis.api as analysis_api


class _ResultQueue:
    """Capture the worker result without starting a multiprocessing queue."""

    def __init__(self) -> None:
        self.items: list[tuple[object, object]] = []

    def put(self, item: tuple[object, object]) -> None:
        """Record one result emitted by the worker."""
        self.items.append(item)


class _FailingSeparator:
    """Raise dependency-controlled sensitive text from the separator boundary."""

    def separate(self, source_path: str) -> dict[str, object]:
        """Simulate a dependency failure after receiving an authorized source path."""
        raise RuntimeError(
            f"decoder failed for {source_path} /Users/Alice/private-song.wav token=super-secret"
        )


def test_stem_worker_failure_log_omits_dependency_payload_and_traceback(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Routine worker diagnostics must not retain dependency payloads or tracebacks."""
    result_queue = _ResultQueue()
    source_path = "/private/customer/Alice/session.wav"

    monkeypatch.setattr(analysis_api, "AudioStemSeparator", _FailingSeparator)
    caplog.set_level(logging.ERROR, logger=analysis_api.__name__)

    analysis_api._stem_separation_worker(source_path, result_queue)

    assert result_queue.items == [
        ("runtime_error", "Runtime error occurred during stem separation.")
    ]
    assert "Stem separation failed with a runtime error." in caplog.text
    assert source_path not in caplog.text
    assert "private-song.wav" not in caplog.text
    assert "super-secret" not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)
