"""One-request subprocess bridge for a native-picker-selected recording.

The selected source is opened as one regular-file descriptor and consumed by
Resource Admission's bounded decoder. Library output is redirected to stderr;
stdout contains one bounded JSON result with fixed, path-free errors.
"""

from __future__ import annotations

import contextlib
import json
import os
import pathlib
import stat
import sys
from typing import BinaryIO, TextIO

MAX_REQUEST_BYTES = 4096
MAX_RESPONSE_BYTES = 1024 * 1024
_ERROR_MESSAGES = {
    "invalid_request": "The transcription request is invalid.",
    "audio_unavailable": "The selected recording could not be opened.",
    "audio_rejected": "Use a supported recording of at most 50 MiB and 120 seconds.",
    "model_unavailable": "The installed transcription model is unavailable.",
    "model_integrity_failed": "The installed transcription model did not pass verification.",
    "invalid_model_output": "The transcription model returned an invalid result.",
    "transcription_too_complex": "The recording exceeds the transcription event limit.",
    "transcription_failed": "The recording could not be transcribed.",
    "result_too_large": "The transcription exceeds the result size limit.",
}


def _object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Reject duplicate JSON fields before the request gains file-read authority."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("invalid_request")
        result[key] = value
    return result


def _read_request(stream: BinaryIO) -> pathlib.Path:
    """Read one bounded native request and admit its absolute selected audio path."""
    raw = stream.read(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        raise ValueError("invalid_request")
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object)
    if not isinstance(value, dict) or set(value) != {"sourcePath"}:
        raise ValueError("invalid_request")
    path = value["sourcePath"]
    if not isinstance(path, str) or not path or len(path) > 4096 or "\x00" in path:
        raise ValueError("invalid_request")
    selected = pathlib.Path(path)
    label = selected.name
    if (
        not selected.is_absolute()
        or selected.suffix.lower() not in {".wav", ".mp3", ".flac"}
        or not 1 <= len(label) <= 255
        or any(
            ord(character) < 32
            or 127 <= ord(character) <= 159
            or 0xD800 <= ord(character) <= 0xDFFF
            or character in "/\\"
            for character in label
        )
    ):
        raise ValueError("invalid_request")
    return selected


def _transcribe_path(path: pathlib.Path) -> dict[str, object]:
    """Open a regular source once and reuse the canonical bounded decode port."""
    from bandscope_analysis.audio_decode import decode_mono_audio
    from bandscope_analysis.transcription.basic_pitch_backend import PCM_POLICY, transcribe_pcm
    from bandscope_analysis.transcription.midi import TranscriptionError

    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(descriptor, "rb") as source:
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                raise TranscriptionError("audio_unavailable")
            audio, sample_rate = decode_mono_audio(source, policy=PCM_POLICY)
    except OSError as error:
        raise TranscriptionError("audio_unavailable") from error
    return {"sourceLabel": path.name, **transcribe_pcm(audio, sample_rate)}


def run(stdin: BinaryIO, stdout: TextIO, stderr: TextIO) -> int:
    """Handle one request and publish exactly one size-bounded JSON document."""
    result: dict[str, object]
    code: str | None = None
    try:
        path = _read_request(stdin)
    except Exception:
        code = "invalid_request"
    if code is None:
        try:
            with contextlib.redirect_stdout(stderr), contextlib.redirect_stderr(stderr):
                result = _transcribe_path(path)
        except Exception as error:
            from bandscope_analysis.audio_resource_policy import AudioResourcePolicyError
            from bandscope_analysis.transcription.midi import TranscriptionError

            if isinstance(error, AudioResourcePolicyError):
                code = "audio_rejected"
            elif isinstance(error, TranscriptionError) and error.code in _ERROR_MESSAGES:
                code = error.code
            else:
                code = "transcription_failed"
    if code is None:
        try:
            encoded = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            if len(encoded.encode("utf-8")) + 1 > MAX_RESPONSE_BYTES:
                code = "result_too_large"
        except Exception:
            code = "invalid_model_output"
    if code is not None:
        encoded = json.dumps(
            {"schemaVersion": 1, "error": {"code": code, "message": _ERROR_MESSAGES[code]}},
            separators=(",", ":"),
        )
    stdout.write(encoded + "\n")
    stdout.flush()
    return int(code is not None)


def main() -> int:
    """Run the native one-shot transcription protocol on standard streams."""
    return run(sys.stdin.buffer, sys.stdout, sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
