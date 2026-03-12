"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime

from bandscope_analysis.api import run_analysis_job


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
    """Read a job payload from stdin and print a structured job response to stdout."""
    try:
        payload = json.load(sys.stdin)
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
    response = run_analysis_job(job_id, request, requested_at)
    json.dump(response, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
