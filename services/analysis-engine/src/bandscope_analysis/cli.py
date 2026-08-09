"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from bandscope_analysis.api import get_analysis_status, run_analysis_job, run_analysis_job_updates
from bandscope_analysis.temporal import TemporalAnalyzer

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

MAX_JSON_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


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


def main() -> int:
    """Read a bounded job payload and print a structured job response to stdout."""
    input_data = sys.stdin.read(MAX_JSON_FILE_SIZE + 1)
    if len(input_data) > MAX_JSON_FILE_SIZE:
        json.dump(failed_cli_response("Job input exceeds maximum size limit"), sys.stdout)
        return 1
    input_data = input_data.strip()
    progress_jsonl = "--progress-jsonl" in sys.argv[1:]
    cli_args = [arg for arg in sys.argv[1:] if arg != "--progress-jsonl"]

    # Check if there are command line arguments (fallback for manual testing)
    if cli_args:
        if cli_args[0] == "--status":
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        elif cli_args[0] == "--job" and len(cli_args) > 1:
            input_data = cli_args[1]
            if not input_data.startswith("{"):
                try:
                    with open(input_data, "r", encoding="utf-8") as f:
                        input_data = f.read(MAX_JSON_FILE_SIZE)
                        if f.read(1):
                            json.dump(
                                failed_cli_response("Job file exceeds maximum size limit"),
                                sys.stdout,
                            )
                            return 1
                except Exception:
                    json.dump(failed_cli_response("Failed to read job file"), sys.stdout)
                    return 1

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
                logging.info(f"Extracted BPM: {features['bpm']}")
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
