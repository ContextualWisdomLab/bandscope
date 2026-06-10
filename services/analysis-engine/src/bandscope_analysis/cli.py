"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from bandscope_analysis.api import get_analysis_status, run_analysis_job
from bandscope_analysis.temporal import TemporalAnalyzer

# Temporary logging setup for temporal analyzer
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


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
    # Read all input from stdin first
    input_data = sys.stdin.read().strip()

    # Check if there are command line arguments (fallback for manual testing)
    separate_stems = "--separate-stems" in sys.argv
    if len(sys.argv) > 1:
        if sys.argv[1] == "--status":
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        elif sys.argv[1] == "--job" and len(sys.argv) > 2:
            input_data = sys.argv[2]
            if not input_data.startswith("{"):
                try:
                    with open(input_data, "r", encoding="utf-8") as f:
                        input_data = f.read()
                except Exception as e:
                    json.dump(failed_cli_response(f"Failed to read job file: {e}"), sys.stdout)
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

    requested_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    # Validate request
    try:
        from bandscope_analysis.api import validate_analysis_job_request

        validate_analysis_job_request(request)
        is_valid = True
    except Exception:
        is_valid = False

    stems = None
    if is_valid and separate_stems:
        if (
            isinstance(request, dict)
            and request.get("sourceKind") == "local_audio"
            and "localSource" in request
        ):
            audio_path = request["localSource"].get("sourcePath")
            if audio_path:
                logging.info(f"Extracting temporal features from {audio_path}...")
                try:
                    temporal_analyzer = TemporalAnalyzer()
                    features = temporal_analyzer.analyze(audio_path)
                    logging.info(f"Extracted BPM: {features['bpm']}")
                except Exception as e:
                    logging.warning(f"Temporal analysis failed, continuing with mock: {e}")

                logging.info(f"Performing stem separation on {audio_path}...")
                # We do not swallow exceptions here per code review
                import librosa

                from bandscope_analysis.separation.audio_separator import AudioStemSeparator

                # Load only the first 10 seconds for the CLI proof to prevent hanging
                y, sr = librosa.load(audio_path, sr=44100, mono=False, duration=10.0)
                separator = AudioStemSeparator()
                stems = separator.separate_audio(y, sample_rate=int(sr), segment_seconds=2.0)
                logging.info(f"Successfully extracted {len(stems)} stems: {list(stems.keys())}")

    response = run_analysis_job(job_id, request, requested_at, stems=stems)
    json.dump(response, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
