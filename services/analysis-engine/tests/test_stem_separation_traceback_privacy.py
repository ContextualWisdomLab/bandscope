"""Regression tests for traceback-free stem-separation diagnostics."""

import logging
from unittest.mock import patch

from bandscope_analysis.api import _stem_separation_worker, run_analysis_job_updates


class _ResultQueue:
    """Capture worker envelopes without crossing a process boundary."""

    def __init__(self) -> None:
        self.items: list[tuple[str, object]] = []

    def put(self, item: tuple[str, object]) -> None:
        """Record one worker result envelope."""
        self.items.append(item)


def _local_audio_request() -> dict[str, object]:
    """Return a valid local-audio request without persistence side effects."""
    return {
        "sourceKind": "local_audio",
        "projectId": "privacy-regression",
        "sourceLabel": "rehearsal.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": "/tmp/rehearsal.wav",
            "fileName": "rehearsal.wav",
            "extension": "wav",
            "fileSizeBytes": 1024,
        },
    }


def test_worker_diagnostic_omits_decoder_exception_traceback(caplog) -> None:
    """Worker logs must not expose decoder-controlled paths through exception tracebacks."""
    secret = "/private/rehearsal/customer-name/audio.wav"
    result_queue = _ResultQueue()

    with (
        caplog.at_level(logging.ERROR, logger="bandscope_analysis.api"),
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
    ):
        separator_class.return_value.separate.side_effect = ValueError(f"invalid media {secret}")
        _stem_separation_worker("/tmp/rehearsal.wav", result_queue)

    assert result_queue.items == [("value_error", "Invalid audio source data.")]
    assert "Stem separation rejected invalid audio source data." in caplog.text
    assert secret not in caplog.text
    assert "Traceback" not in caplog.text


def test_job_failure_diagnostic_omits_source_exception_traceback(caplog) -> None:
    """Job-level safe failure must not log a source-path-bearing exception traceback."""
    secret = "/private/rehearsal/customer-name/missing.wav"

    with (
        caplog.at_level(logging.ERROR, logger="bandscope_analysis.api"),
        patch(
            "bandscope_analysis.api._build_local_audio_features",
            side_effect=FileNotFoundError(secret),
        ),
    ):
        updates = run_analysis_job_updates(
            "job-privacy",
            _local_audio_request(),
            "2026-09-11T04:00:00Z",
        )

    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"]["message"] == "Stem separation failed"
    assert "Stem separation failed before analysis job completion." in caplog.text
    assert secret not in caplog.text
    assert "Traceback" not in caplog.text
