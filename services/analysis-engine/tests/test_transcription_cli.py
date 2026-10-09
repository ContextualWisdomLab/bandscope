"""One-shot JSON, privacy and resource-boundary tests for the transcription bridge."""

from __future__ import annotations

import importlib
import io
import json
import pathlib
import runpy
import sys
import warnings
from types import SimpleNamespace

import numpy as np
import pytest

from bandscope_analysis.transcription import cli
from bandscope_analysis.transcription.midi import TranscriptionError


def _run(request: bytes) -> tuple[int, dict[str, object], str]:
    """Run the protocol with independent in-memory binary and text streams."""
    stdout, stderr = io.StringIO(), io.StringIO()
    status = cli.run(io.BytesIO(request), stdout, stderr)
    lines = stdout.getvalue().splitlines()
    assert len(lines) == 1
    return status, json.loads(lines[0]), stderr.getvalue()


def _request(path: pathlib.Path) -> bytes:
    """Encode the single authorized source field accepted by native transcription."""
    return json.dumps({"sourcePath": str(path)}).encode()


@pytest.mark.parametrize(
    "raw_request",
    [
        b"",
        b"\xff",
        b"{}",
        b"[]",
        b'{"sourcePath":null}',
        b'{"sourcePath":"relative.wav"}',
        b'{"sourcePath":"/tmp/a.wav","sourcePath":"/tmp/b.wav"}',
        b'{"sourcePath":"/tmp/a.wav","threshold":0.5}',
        b'{"sourcePath":"/tmp/a.wav"}{}',
        b'{"sourcePath":"https://example.com/a.wav"}',
        b'{"sourcePath":"/tmp/a.wav\\u0000"}',
        b'{"sourcePath":"/tmp/a.exe"}',
        b'{"sourcePath":"/tmp/phone-recording.m4a"}',
        b'{"sourcePath":"/tmp/a\\nb.wav"}',
        b'{"sourcePath":"/tmp/a\\u0085b.wav"}',
        b'{"sourcePath":"/tmp/a\\ud800b.wav"}',
        b'{"sourcePath":"/tmp/a\\\\b.wav"}',
        json.dumps({"sourcePath": "/tmp/" + "x" * 256 + ".wav"}).encode(),
        json.dumps({"sourcePath": "/tmp/" + "x" * 4100 + ".wav"}).encode(),
        b" " * (cli.MAX_REQUEST_BYTES + 1),
    ],
)
def test_invalid_requests_never_gain_file_read_authority(raw_request: bytes) -> None:
    """Reject unknown fields, duplicate keys, remote paths and oversized requests."""
    status, result, _ = _run(raw_request)
    assert status == 1
    assert result["error"]["code"] == "invalid_request"


def test_missing_audio_error_never_echoes_local_path(tmp_path: pathlib.Path) -> None:
    """The caller receives a stable unavailable error rather than OS/path diagnostics."""
    status, result, _ = _run(_request(tmp_path / "private-recording.wav"))
    assert status == 1
    assert result["error"]["code"] == "audio_unavailable"
    assert str(tmp_path) not in json.dumps(result)
    assert "private-recording" not in json.dumps(result)


def test_real_canonical_decode_and_silent_midi_round_trip(tmp_path: pathlib.Path) -> None:
    """An actual WAV must traverse the existing bounded decoder into a real MIDI result."""
    wavfile = importlib.import_module("scipy.io.wavfile")
    path = tmp_path / "silent.wav"
    wavfile.write(path, 22050, np.zeros(22050, dtype=np.float32))
    status, result, _ = _run(_request(path))
    assert status == 0
    assert result["sourceLabel"] == "silent.wav"
    assert result["durationSeconds"] == 1
    assert result["notes"] == []
    assert result["midiBase64"].startswith("TVRoZA")
    assert str(tmp_path) not in json.dumps(result)


def test_missing_basic_pitch_package_still_returns_the_stable_error_protocol(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Model discovery failure must survive exception imports without a traceback on stdout."""
    backend = importlib.import_module("bandscope_analysis.transcription.basic_pitch_backend")
    wavfile = importlib.import_module("scipy.io.wavfile")
    path = tmp_path / "recording.wav"
    wavfile.write(path, 22050, np.zeros(22050, dtype=np.float32))

    def missing(_name: str) -> None:
        """Model a missing optional transcription package in an otherwise valid installation."""
        raise importlib.metadata.PackageNotFoundError("private-installation-path")

    monkeypatch.setattr(backend.importlib.metadata, "distribution", missing)
    status, result, _ = _run(_request(path))
    assert status == 1
    assert result["error"]["code"] == "model_unavailable"
    assert "private-installation-path" not in json.dumps(result)


def test_native_request_byte_ceiling_is_exactly_four_kib() -> None:
    """CLI admission must share the native command's whole-JSON byte ceiling."""
    assert cli.MAX_REQUEST_BYTES == 4096
    status, result, _ = _run(b" " * 4097)
    assert status == 1
    assert result["error"]["code"] == "invalid_request"


def test_encoded_resource_limit_is_enforced_before_header_decode(tmp_path: pathlib.Path) -> None:
    """A sparse over-limit file must fail without attempting expensive malformed decode."""
    path = tmp_path / "oversized.wav"
    with path.open("wb") as source:
        source.truncate(50 * 1024 * 1024 + 1)
    status, result, _ = _run(_request(path))
    assert status == 1
    assert result["error"]["code"] == "audio_rejected"


def test_nonregular_file_is_rejected_after_nonblocking_open(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Device and pipe descriptors must not be handed to the media decoder."""
    path = tmp_path / "not-regular.wav"
    path.touch()
    monkeypatch.setattr(cli.os, "fstat", lambda _fd: SimpleNamespace(st_mode=0))
    status, result, _ = _run(_request(path))
    assert status == 1
    assert result["error"]["code"] == "audio_unavailable"


def test_library_prints_and_warnings_cannot_corrupt_stdout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only the protocol result goes to stdout while third-party chatter stays on stderr."""

    def noisy(_path: pathlib.Path) -> dict[str, object]:
        """Model an upstream banner and warning before a valid result."""
        print("upstream prediction banner")
        warnings.warn("upstream compatibility warning", UserWarning, stacklevel=1)
        return {"schemaVersion": 1, "notes": []}

    monkeypatch.setattr(cli, "_transcribe_path", noisy)
    with pytest.warns(UserWarning, match="upstream compatibility warning"):
        status, result, stderr = _run(_request(pathlib.Path.cwd() / "recording.wav"))
    assert status == 0 and result == {"schemaVersion": 1, "notes": []}
    assert "upstream prediction banner" in stderr


@pytest.mark.parametrize("code", ["model_integrity_failed", "private-path-secret"])
def test_known_and_unknown_domain_errors_use_only_allowed_codes(
    code: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unexpected exception metadata cannot become a user-visible path or message."""

    def failure(_path: pathlib.Path) -> dict[str, object]:
        """Raise a domain failure without returning a partial result."""
        raise TranscriptionError(code)

    monkeypatch.setattr(cli, "_transcribe_path", failure)
    status, result, _ = _run(_request(pathlib.Path.cwd() / "recording.wav"))
    assert status == 1
    expected = code if code == "model_integrity_failed" else "transcription_failed"
    assert result["error"]["code"] == expected
    assert "private-path-secret" not in json.dumps(result)


@pytest.mark.parametrize(
    "payload,code",
    [
        ({"value": float("nan")}, "invalid_model_output"),
        ({"value": "x" * (1024 * 1024)}, "result_too_large"),
    ],
)
def test_nonfinite_or_oversized_output_fails_without_partial_stdout(
    payload: dict[str, object], code: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Response limits are measured on the complete UTF-8 serialization before writing."""
    monkeypatch.setattr(cli, "_transcribe_path", lambda _path: payload)
    status, result, _ = _run(_request(pathlib.Path.cwd() / "recording.wav"))
    assert status == 1
    assert result["error"]["code"] == code


def test_module_entrypoint_exits_with_the_protocol_status(monkeypatch: pytest.MonkeyPatch) -> None:
    """The native module invocation must preserve a stable failing process exit code."""
    stdout, stderr = io.StringIO(), io.StringIO()
    monkeypatch.setattr(sys, "stdin", SimpleNamespace(buffer=io.BytesIO(b"{}")))
    monkeypatch.setattr(sys, "stdout", stdout)
    monkeypatch.setattr(sys, "stderr", stderr)
    monkeypatch.delitem(sys.modules, "bandscope_analysis.transcription.cli")
    with pytest.raises(SystemExit, match="^1$"):
        runpy.run_module("bandscope_analysis.transcription.cli", run_name="__main__")
    assert json.loads(stdout.getvalue())["error"]["code"] == "invalid_request"
