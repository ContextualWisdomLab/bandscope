"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from bandscope_analysis.api import get_analysis_status, run_analysis_job, run_analysis_job_updates
from bandscope_analysis.temporal import TemporalAnalyzer

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# Bound every untrusted JSON ingress by encoded bytes, not Python character count.
MAX_JSON_FILE_SIZE = 10 * 1024 * 1024  # 10 MiB


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


def _utf8_size_exceeds_limit(value: str) -> bool:
    """Return whether ``value`` exceeds the shared UTF-8 JSON byte limit."""
    return len(value.encode("utf-8")) > MAX_JSON_FILE_SIZE


def _read_bounded_stdin() -> tuple[str | None, str | None]:
    """Read stdin with a hard bound and return text plus an optional error message."""
    try:
        input_data = sys.stdin.read(MAX_JSON_FILE_SIZE + 1)
    except UnicodeDecodeError:
        return None, "Job input must be valid UTF-8"
    if len(input_data) > MAX_JSON_FILE_SIZE or _utf8_size_exceeds_limit(input_data):
        return None, "Job input exceeds maximum size limit"
    return input_data.strip(), None


def _read_bounded_job_file(path: str) -> tuple[str | None, str | None]:
    """Read one UTF-8 job file without allocating beyond the configured byte limit."""
    try:
        with open(path, "rb") as job_file:
            payload = job_file.read(MAX_JSON_FILE_SIZE + 1)
    except OSError:
        return None, "Failed to read job file"
    if len(payload) > MAX_JSON_FILE_SIZE:
        return None, "Job file exceeds maximum size limit"
    try:
        return payload.decode("utf-8").strip(), None
    except UnicodeDecodeError:
        return None, "Job file must be valid UTF-8"


def main() -> int:
    """Read a bounded job payload and print a structured job response to stdout."""
    input_data, input_error = _read_bounded_stdin()
    if input_error is not None:
        json.dump(failed_cli_response(input_error), sys.stdout)
        return 1
    assert input_data is not None

    progress_jsonl = "--progress-jsonl" in sys.argv[1:]
    cli_args = [arg for arg in sys.argv[1:] if arg != "--progress-jsonl"]

    # Check if there are command line arguments (fallback for manual testing).
    if cli_args:
        if cli_args[0] == "--status":
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        if cli_args[0] == "--job" and len(cli_args) > 1:
            input_data = cli_args[1]
            if input_data.startswith("{"):
                if _utf8_size_exceeds_limit(input_data):
                    json.dump(
                        failed_cli_response("Job input exceeds maximum size limit"),
                        sys.stdout,
                    )
                    return 1
            else:
                input_data, file_error = _read_bounded_job_file(input_data)
                if file_error is not None:
                    json.dump(failed_cli_response(file_error), sys.stdout)
                    return 1
                assert input_data is not None

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

    # Temporary: Inject temporal analyzer call if it's a local file, just to prove it works
    # before full orchestrator integration
    if (
        isinstance(request, dict)
        and request.get("sourceKind") == "local_audio"
        and "localSource" in request
    ):
        local_source = request["localSource"]
        audio_path = local_source.get("sourcePath")
        file_name = local_source.get("fileName", "selected audio")
        if audio_path:
            logging.info("Extracting temporal features from %s...", file_name)
            try:
                temporal_analyzer = TemporalAnalyzer()
                features = temporal_analyzer.analyze(audio_path)
                logging.info("Extracted BPM: %s", features["bpm"])
            except Exception:
                logging.warning(
                    "Temporal analysis failed for %s; continuing with safe fallback.",
                    file_name,
                )

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
