"""Normalize OSSF Scorecard SARIF so GitHub can ingest repository findings."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SCORECARD_REPOSITORY_PLACEHOLDER_URI = "no file associated with this alert"
SCORECARD_WORKFLOW_URI = ".github/workflows/ossf-scorecard.yml"


def normalize_scorecard_sarif(source: Path, target: Path) -> int:
    """Rewrite repository-level Scorecard placeholder URIs and return change count."""
    sarif = json.loads(source.read_text(encoding="utf-8"))
    rewritten = 0

    runs = sarif.get("runs", []) if isinstance(sarif, dict) else []
    for run in runs:
        if not isinstance(run, dict):
            continue
        for result in run.get("results", []):
            if not isinstance(result, dict):
                continue
            for location in result.get("locations", []):
                if not isinstance(location, dict):
                    continue
                physical_location = location.get("physicalLocation")
                if not isinstance(physical_location, dict):
                    continue
                artifact_location = physical_location.get("artifactLocation")
                if not isinstance(artifact_location, dict):
                    continue
                if artifact_location.get("uri") != SCORECARD_REPOSITORY_PLACEHOLDER_URI:
                    continue
                artifact_location["uri"] = SCORECARD_WORKFLOW_URI
                physical_location.setdefault("region", {"startLine": 1})
                properties = physical_location.setdefault("properties", {})
                if isinstance(properties, dict):
                    properties["bandscopeOriginalUri"] = (
                        SCORECARD_REPOSITORY_PLACEHOLDER_URI
                    )
                    properties["bandscopeRepositoryLevelFinding"] = True
                rewritten += 1

    target.write_text(
        json.dumps(sarif, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return rewritten


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Normalize OSSF Scorecard SARIF repository-level locations."
    )
    parser.add_argument("source", type=Path, help="Path to the Scorecard SARIF file")
    parser.add_argument("target", type=Path, help="Path to write normalized SARIF")
    return parser.parse_args()


def main() -> None:
    """Normalize a Scorecard SARIF file from the command line."""
    args = parse_args()
    rewritten = normalize_scorecard_sarif(args.source, args.target)
    print(f"Normalized {rewritten} OSSF Scorecard repository-level SARIF locations")


if __name__ == "__main__":
    main()
