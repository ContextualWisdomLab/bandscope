"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime

from bandscope_analysis.api import run_analysis_job


def main() -> int:
    """Read a job payload from stdin and print a structured job response to stdout."""
    payload = json.load(sys.stdin)
    job_id = payload.get("jobId", "unknown-job") if isinstance(payload, dict) else "unknown-job"
    request = payload.get("request") if isinstance(payload, dict) else payload
    requested_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    response = run_analysis_job(str(job_id), request, requested_at)
    json.dump(response, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
