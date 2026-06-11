"""Tests for the analysis-engine orchestration CLI."""

from __future__ import annotations

import io
import json
import os
import runpy
import subprocess
import sys
import warnings
from pathlib import Path
from typing import Any, cast

import pytest

from bandscope_analysis import cli


def run_cli(payload: object) -> Any:
    """Run the analysis CLI with a JSON payload and return its JSON response."""
    repo_root = Path(__file__).resolve().parents[3]
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "bandscope_analysis.cli",
        ],
        cwd=repo_root / "services" / "analysis-engine",
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
        env={
            **os.environ,
            "PYTHONPATH": str(repo_root / "services" / "analysis-engine" / "src"),
        },
    )
    return json.loads(completed.stdout)


def test_cli_returns_succeeded_job_status_for_valid_request() -> None:
    """Ensure the CLI returns a structured succeeded status for a valid request."""
    payload = {
        "jobId": "job-1",
        "request": {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar", "lead-vocal"],
        },
    }

    response = run_cli(payload)

    assert response["jobId"] == "job-1"
    assert response["state"] == "succeeded"
    assert cast(Any, response["result"])["title"] == "Late Night Set"


def test_cli_returns_succeeded_job_status_for_valid_local_audio_request() -> None:
    """Ensure the CLI accepts the local-audio intake request shape."""
    payload = {
        "jobId": "job-local-1",
        "request": {
            "sourceKind": "local_audio",
            "projectId": "project-1",
            "sourceLabel": "late-night-set.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": "/Users/test/Music/late-night-set.wav",
                "fileName": "late-night-set.wav",
                "extension": "wav",
                "fileSizeBytes": 1024000,
            },
        },
    }

    response = run_cli(payload)

    assert response["jobId"] == "job-local-1"
    assert response["state"] == "succeeded"


def test_cli_returns_failed_status_for_invalid_request() -> None:
    """Ensure the CLI returns a typed invalid-request failure for malformed payloads."""
    response = run_cli({"jobId": "job-2", "request": {"sourceKind": "demo"}})

    assert response["jobId"] == "job-2"
    assert response["state"] == "failed"
    assert response["error"] == {
        "code": "invalid_request",
        "message": "Invalid analysis job request: invalid field 'sourceLabel'",
    }


def test_cli_returns_failed_status_for_invalid_local_audio_request() -> None:
    """Ensure malformed local-audio metadata is rejected safely."""
    response = run_cli(
        {
            "jobId": "job-local-2",
            "request": {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "late-night-set.wav",
                "roleFocus": ["bass-guitar"],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "ogg",
                    "fileSizeBytes": 1024000,
                },
            },
        }
    )

    assert response["state"] == "failed"
    assert (
        response["error"]["message"]
        == "Invalid analysis job request: invalid field 'localSource.extension'"
    )


def test_cli_main_reads_stdin_and_writes_stdout(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the CLI entrypoint can be exercised in-process for coverage."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-3",
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Late Night Set",
                    "roleFocus": ["keys-right"],
                },
            }
        )
    )
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    assert json.loads(stdout.getvalue())["jobId"] == "job-3"


def test_cli_main_handles_non_mapping_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the CLI handles non-dict payloads without crashing."""
    stdin = io.StringIO(json.dumps(["demo"]))
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    response = json.loads(stdout.getvalue())
    assert response["jobId"] == "unknown-job"
    assert response["state"] == "failed"


def test_cli_main_rejects_invalid_job_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure malformed job identifiers return a typed invalid-request error."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": 7,
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Late Night Set",
                    "roleFocus": ["bass-guitar"],
                },
            }
        )
    )
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    response = json.loads(stdout.getvalue())
    assert response["error"]["message"] == "Invalid analysis job request: invalid field 'jobId'"


def test_cli_main_handles_malformed_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure malformed JSON yields a typed invalid-request failure envelope."""
    stdin = io.StringIO("{")
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    response = json.loads(stdout.getvalue())
    assert response["jobId"] == "unknown-job"
    assert response["state"] == "failed"
    assert response["error"]["code"] == "invalid_request"


def test_cli_module_runs_as_main(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the module-level main guard is covered by executing the module directly."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-4",
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Late Night Set",
                    "roleFocus": ["bass-guitar"],
                },
            }
        )
    )
    stdout = io.StringIO()

    monkeypatch.setattr(sys, "stdin", stdin)
    monkeypatch.setattr(sys, "stdout", stdout)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            monkeypatch.delitem(sys.modules, "bandscope_analysis.cli", raising=False)
            runpy.run_module("bandscope_analysis.cli", run_name="__main__")
    except SystemExit as exit_signal:
        assert exit_signal.code == 0

    assert json.loads(stdout.getvalue())["jobId"] == "job-4"


def test_cli_main_empty_input(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure empty input yields an error."""
    stdin = io.StringIO("")
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    assert cli.main() == 0
    assert "Empty input" in stdout.getvalue()


def test_cli_main_status_arg(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure --status returns the analysis engine status."""
    stdin = io.StringIO("")
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--status"])
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    assert cli.main() == 0
    assert "ready" in stdout.getvalue()


def test_cli_main_job_arg_invalid_file(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """Ensure --job with missing file yields an error."""
    stdin = io.StringIO("")
    stdout = io.StringIO()
    non_existent = tmp_path / "nope.json"
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", str(non_existent)])
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    assert cli.main() == 1
    assert "Failed to read job file" in stdout.getvalue()


def test_cli_main_job_arg_valid_file(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """Ensure --job with valid file processes the job."""
    job_file = tmp_path / "job.json"
    job_file.write_text(
        json.dumps(
            {
                "jobId": "job-file",
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Late Night Set",
                    "roleFocus": ["keys-right"],
                },
            }
        )
    )
    stdin = io.StringIO("")
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", str(job_file)])
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    assert cli.main() == 0
    assert "job-file" in stdout.getvalue()


def test_cli_main_job_arg_json_string(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure --job with raw JSON string processes the job."""
    json_str = json.dumps(
        {
            "jobId": "job-raw",
            "request": {
                "sourceKind": "demo",
                "sourceLabel": "Raw String",
                "roleFocus": ["keys-right"],
            },
        }
    )
    stdin = io.StringIO("")
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", json_str])
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    assert cli.main() == 0
    assert "job-raw" in stdout.getvalue()


def test_cli_main_temporal_analyzer_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the temporal analyzer injection block is covered and handles errors."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-audio",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "p1",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/invalid/path.wav",
                        "fileName": "test.wav",
                        "extension": "wav",
                        "fileSizeBytes": 100,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()

    class FakeAnalyzer:
        def analyze(self, path):
            raise RuntimeError("mocked failure")

    monkeypatch.setattr(cli, "TemporalAnalyzer", FakeAnalyzer)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])

    assert cli.main() == 0
    res = json.loads(stdout.getvalue())
    assert res["jobId"] == "job-audio"


def test_cli_main_temporal_analyzer_mock_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the temporal analyzer injection block succeeds."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-audio-success",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "p1",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/valid/path.wav",
                        "fileName": "test.wav",
                        "extension": "wav",
                        "fileSizeBytes": 100,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()

    class FakeAnalyzerSuccess:
        def analyze(self, path):
            return {"bpm": 120.0, "beats": []}

    monkeypatch.setattr(cli, "TemporalAnalyzer", FakeAnalyzerSuccess)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])

    assert cli.main() == 0
    res = json.loads(stdout.getvalue())
    assert res["jobId"] == "job-audio-success"


def test_cli_main_temporal_analyzer_and_separator_mock_success(monkeypatch) -> None:
    """Ensure the temporal analyzer and stem separator injection block succeeds."""
    import io
    import json

    from bandscope_analysis import cli

    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-audio-success-sep",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "p1",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/valid/path.wav",
                        "fileName": "test.wav",
                        "extension": "wav",
                        "fileSizeBytes": 100,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()

    class FakeAnalyzerSuccess:
        def analyze(self, path):
            return {"bpm": 120.0, "beats": []}

    calls = {"librosa_load": 0, "separate_audio": 0}

    class FakeAudioStemSeparator:
        def separate_audio(self, audio, sample_rate, segment_seconds=2.0):
            import numpy as np

            calls["separate_audio"] += 1
            assert sample_rate == 44100
            assert segment_seconds == 2.0
            return {
                "vocals": np.zeros((2, 100), dtype=np.float32),
                "drums": np.zeros((2, 100), dtype=np.float32),
                "bass": np.zeros((2, 100), dtype=np.float32),
                "other": np.zeros((2, 100), dtype=np.float32),
            }

    def fake_librosa_load(path, sr, mono, duration):
        import numpy as np

        calls["librosa_load"] += 1
        assert path == "/valid/path.wav"
        assert sr == 44100
        assert mono is False
        assert duration == 10.0
        return np.zeros((2, 100), dtype=np.float32), sr

    import librosa

    monkeypatch.setattr(librosa, "load", fake_librosa_load)
    import bandscope_analysis.separation.audio_separator

    monkeypatch.setattr(
        bandscope_analysis.separation.audio_separator,
        "AudioStemSeparator",
        FakeAudioStemSeparator,
    )

    monkeypatch.setattr(cli, "TemporalAnalyzer", FakeAnalyzerSuccess)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--separate-stems"])

    assert cli.main() == 0
    res = json.loads(stdout.getvalue())
    assert res["jobId"] == "job-audio-success-sep"
    assert calls["librosa_load"] == 1
    assert calls["separate_audio"] == 1


def test_cli_main_separator_skips_invalid_request(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure invalid requests do not enter the stem separation path."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-audio-invalid-sep",
                "request": {
                    "sourceKind": "local_audio",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                },
            }
        )
    )
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--separate-stems"])

    assert cli.main() == 0
    res = json.loads(stdout.getvalue())
    assert res["jobId"] == "job-audio-invalid-sep"
    assert res["state"] == "failed"


def test_cli_main_separator_continues_after_temporal_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure stem separation still runs when the optional temporal probe fails."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-audio-temporal-fail-sep",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "p1",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/valid/path.wav",
                        "fileName": "test.wav",
                        "extension": "wav",
                        "fileSizeBytes": 100,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()
    calls = {"librosa_load": 0, "separate_audio": 0}

    class FakeAnalyzerFailure:
        def analyze(self, path):
            raise RuntimeError("mocked temporal failure")

    class FakeAudioStemSeparator:
        def separate_audio(self, audio, sample_rate, segment_seconds=2.0):
            import numpy as np

            calls["separate_audio"] += 1
            return {
                "vocals": np.zeros((2, 100), dtype=np.float32),
                "drums": np.zeros((2, 100), dtype=np.float32),
                "bass": np.zeros((2, 100), dtype=np.float32),
                "other": np.zeros((2, 100), dtype=np.float32),
            }

    def fake_librosa_load(path, sr, mono, duration):
        import numpy as np

        calls["librosa_load"] += 1
        return np.zeros((2, 100), dtype=np.float32), sr

    import librosa

    monkeypatch.setattr(librosa, "load", fake_librosa_load)
    import bandscope_analysis.separation.audio_separator

    monkeypatch.setattr(
        bandscope_analysis.separation.audio_separator,
        "AudioStemSeparator",
        FakeAudioStemSeparator,
    )

    monkeypatch.setattr(cli, "TemporalAnalyzer", FakeAnalyzerFailure)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--separate-stems"])

    assert cli.main() == 0
    res = json.loads(stdout.getvalue())
    assert res["jobId"] == "job-audio-temporal-fail-sep"
    assert calls["librosa_load"] == 1
    assert calls["separate_audio"] == 1


def test_cli_main_temporal_analyzer_and_separator_mock_skipped(monkeypatch) -> None:
    """Ensure stem separation is skipped if --separate-stems is not provided."""
    import io
    import json

    from bandscope_analysis import cli

    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-audio-skip-sep",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "p1",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/valid/path.wav",
                        "fileName": "test.wav",
                        "extension": "wav",
                        "fileSizeBytes": 100,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()

    class FakeAnalyzerSuccess:
        def analyze(self, path):
            return {"bpm": 120.0, "beats": []}

    calls = {"librosa_load": 0, "separate_audio": 0}

    class FakeAudioStemSeparator:
        def separate_audio(self, audio, sample_rate, segment_seconds=2.0):
            calls["separate_audio"] += 1
            return {}

    def fake_librosa_load(path, sr, mono, duration):
        calls["librosa_load"] += 1
        return None, sr

    import librosa

    monkeypatch.setattr(librosa, "load", fake_librosa_load)
    import bandscope_analysis.separation.audio_separator

    monkeypatch.setattr(
        bandscope_analysis.separation.audio_separator,
        "AudioStemSeparator",
        FakeAudioStemSeparator,
    )

    monkeypatch.setattr(cli, "TemporalAnalyzer", FakeAnalyzerSuccess)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])

    assert cli.main() == 0
    res = json.loads(stdout.getvalue())
    assert res["jobId"] == "job-audio-skip-sep"
    assert calls["librosa_load"] == 0
    assert calls["separate_audio"] == 0
