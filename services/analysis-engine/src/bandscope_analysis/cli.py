"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from bandscope_analysis.api import get_analysis_status, run_analysis_job, run_analysis_job_updates
from bandscope_analysis.temporal import TemporalAnalyzer as _TemporalAnalyzer

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

MAX_JSON_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Compatibility hook for existing CLI-level tests and downstream monkeypatches.
# The CLI intentionally does not invoke temporal analysis before request validation;
# validated orchestration owns every local-audio file access.
TemporalAnalyzer = _TemporalAnalyzer


def failed_cli_response(message: str) -> dict[str, object]:
    """Return a typed CLI failure envelope for malformed stdin payloads."""
    requested_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    return {
        "jobId": "unknown-job",
        "state": "failed",
        "requestedAt": requested_at,
        "updatedAt": requested_at,
        "error": {
            "code": "invalid_request",
            "message": message,
        },
    }


def _read_bounded_stdin() -> tuple[str | None, int]:
    """Read one bounded UTF-8 stdin payload and return text plus an exit code.

    Standard process stdin exposes ``buffer``; enforce the allocation bound on
    raw bytes before UTF-8 decoding. Text-only injected streams are already
    decoded outside this boundary, so retain a compatibility path for in-process
    callers. Failures are emitted here so callers never need to retain rejected
    payload content.
    """
    binary_stdin = getattr(sys.stdin, "buffer", None)
    if binary_stdin is None:
        raw_text = sys.stdin.read(MAX_JSON_FILE_SIZE + 1)
        raw_bytes = raw_text.encode("utf-8")
    else:
        raw_bytes = binary_stdin.read(MAX_JSON_FILE_SIZE + 1)
    if len(raw_bytes) > MAX_JSON_FILE_SIZE:
        json.dump(failed_cli_response("Job input exceeds maximum size limit"), sys.stdout)
        return None, 1
    try:
        raw_text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        json.dump(failed_cli_response("Job input must be valid UTF-8"), sys.stdout)
        return None, 1
    return raw_text.strip(), 0


def main() -> int:
    """Read one explicit argument or bounded stdin job and print its response."""
    progress_jsonl = "--progress-jsonl" in sys.argv[1:]
    cli_args = [arg for arg in sys.argv[1:] if arg != "--progress-jsonl"]
    input_data: str | None = None

    # Explicit argument modes own their input source. Resolve them before touching
    # stdin so ``--status`` and ``--job`` cannot block on an unrelated open pipe or
    # consume data that the caller did not select as the job payload.
    if cli_args:
        if cli_args[0] == "--status":
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        if cli_args[0] == "--job":
            if len(cli_args) != 2:
                json.dump(
                    failed_cli_response(
                        "--job requires exactly one JSON payload or file path"
                    ),
                    sys.stdout,
                )
                return 1
            input_data = cli_args[1]
            if input_data.startswith("{"):
                if len(input_data.encode("utf-8")) > MAX_JSON_FILE_SIZE:
                    json.dump(
                        failed_cli_response("Job input exceeds maximum size limit"), sys.stdout
                    )
                    return 1
            else:
                try:
                    with open(input_data, "rb") as f:
                        input_bytes = f.read(MAX_JSON_FILE_SIZE + 1)
                        if len(input_bytes) > MAX_JSON_FILE_SIZE:
                            json.dump(
                                failed_cli_response("Job file exceeds maximum size limit"),
                                sys.stdout,
                            )
                            return 1
                        input_data = input_bytes.decode("utf-8")
                except Exception:
                    json.dump(failed_cli_response("Failed to read job file"), sys.stdout)
                    return 1

    if input_data is None:
        input_data, stdin_exit_code = _read_bounded_stdin()
        if input_data is None:
            return stdin_exit_code

    if not input_data:
        json.dump(failed_cli_response("Empty input"), sys.stdout)
        return 0

    try:
        payload = json.loads(input_data)
    except json.JSONDecodeError as error:
        json.dump(failed_cli_response(f"Invalid analysis job request: {error.msg}"), sys.stdout)
        return 0

    if not isinstance(payload, dict):
        json.dump(
            failed_cli_response("Invalid analysis job request: invalid field 'root'"), sys.stdout
        )
        return 0

    job_id = payload.get("jobId")
    if not isinstance(job_id, str) or not job_id.strip():
        json.dump(
            failed_cli_response("Invalid analysis job request: invalid field 'jobId'"), sys.stdout
        )
        return 0

    request = payload.get("request")
    requested_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    if progress_jsonl:
        for update in run_analysis_job_updates(job_id, request, requested_at):
            json.dump(update, sys.stdout)
            sys.stdout.write("\n")
            sys.stdout.flush()
        return 0

    response = run_analysis_job(job_id, request, requested_at)
    json.dump(response, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
