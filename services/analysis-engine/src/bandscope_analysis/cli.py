"""Command-line interface for the BandScope analysis engine."""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict

from bandscope_analysis.api import get_analysis_status, run_analysis_job
from bandscope_analysis.temporal import TemporalAnalyzer

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main() -> None:
    """Run the analysis CLI."""
    parser = argparse.ArgumentParser(description="BandScope local analysis engine.")
    parser.add_argument("--status", action="store_true", help="Print health status and exit.")
    parser.add_argument(
        "--job",
        type=str,
        help="JSON string or path to JSON file containing the AnalysisJobRequest payload.",
    )
    parser.add_argument("--job-id", type=str, default="cli-job", help="Job ID for the output.")

    args = parser.parse_args()

    if args.status:
        print(json.dumps(get_analysis_status(), indent=2))
        sys.exit(0)

    if args.job:
        try:
            if args.job.startswith("{"):
                payload: Dict[str, Any] = json.loads(args.job)
            else:
                job_path = Path(args.job)
                if not job_path.exists():
                    print(f"Error: Job file {job_path} not found.", file=sys.stderr)
                    sys.exit(1)
                payload = json.loads(job_path.read_text("utf-8"))

            # Temporary: Inject temporal analyzer call if it's a local file, just to prove it works
            # before full orchestrator integration
            if payload.get("sourceKind") == "local_audio" and "localSource" in payload:
                audio_path = payload["localSource"]["sourcePath"]
                logging.info(f"Extracting temporal features from {audio_path}...")
                try:
                    temporal_analyzer = TemporalAnalyzer()
                    features = temporal_analyzer.analyze(audio_path)
                    logging.info(f"Extracted BPM: {features['bpm']}")
                except Exception as e:
                    logging.warning(f"Temporal analysis failed, continuing with mock: {e}")

            result = run_analysis_job(args.job_id, payload, "now")
            print(json.dumps(result, indent=2))
            if result.get("state") == "failed":
                sys.exit(1)
            sys.exit(0)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON payload. {e}", file=sys.stderr)
            sys.exit(1)

    parser.print_help()


if __name__ == "__main__":
    main()
