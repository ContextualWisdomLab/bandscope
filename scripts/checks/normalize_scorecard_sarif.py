"""Normalize OSSF Scorecard SARIF so GitHub can ingest repository findings."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SCORECARD_REPOSITORY_PLACEHOLDER_URI = "no file associated with this alert"
SCORECARD_WORKFLOW_URI = ".github/workflows/ossf-scorecard.yml"
NON_BLOCKING_SCORECARD_RULE_IDS = {
    "CIIBestPracticesID",
}


def is_non_blocking_scorecard_result(result: object) -> bool:
    """Return whether a Scorecard result should stay out of code scanning gates."""
    return (
        isinstance(result, dict)
        and result.get("ruleId") in NON_BLOCKING_SCORECARD_RULE_IDS
    )


def downgrade_non_blocking_scorecard_result(result: dict) -> int:
    """Keep a non-blocking Scorecard result visible without tripping gates."""
    rewritten = 0
    if result.get("level") != "note":
        result["level"] = "note"
        rewritten += 1

    properties = result.get("properties")
    if not isinstance(properties, dict):
        properties = {}
        result["properties"] = properties
        rewritten += 1
    if properties.get("bandscopeNonBlockingScorecardSignal") is not True:
        properties["bandscopeNonBlockingScorecardSignal"] = True
        rewritten += 1

    locations = result.get("locations")
    if isinstance(locations, list) and locations:
        return rewritten

    result["locations"] = [
        {
            "physicalLocation": {
                "artifactLocation": {"uri": SCORECARD_WORKFLOW_URI},
                "region": {"startLine": 1},
                "properties": {
                    "bandscopeNonBlockingScorecardSignal": True,
                    "bandscopeRepositoryLevelFinding": True,
                },
            }
        }
    ]
    return rewritten + 1


def normalize_scorecard_sarif(source: Path, target: Path) -> int:
    """Normalize Scorecard SARIF locations/results and return the change count."""
    sarif = json.loads(source.read_text(encoding="utf-8"))
    rewritten = 0

    runs = sarif.get("runs", []) if isinstance(sarif, dict) else []
    if not isinstance(runs, list):
        runs = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        results = run.get("results", [])
        if not isinstance(results, list):
            continue
        for result in results:
            if not isinstance(result, dict):
                continue
            if is_non_blocking_scorecard_result(result):
                rewritten += downgrade_non_blocking_scorecard_result(result)
            locations = result.get("locations", [])
            if not isinstance(locations, list):
                continue
            for location in locations:
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
                region = physical_location.get("region")
                if not isinstance(region, dict):
                    region = {}
                    physical_location["region"] = region
                start_line = region.get("startLine")
                if type(start_line) is not int or start_line < 1:
                    region["startLine"] = 1
                properties = physical_location.get("properties")
                if not isinstance(properties, dict):
                    properties = {}
                    physical_location["properties"] = properties
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
        description="Normalize OSSF Scorecard SARIF for GitHub code scanning upload."
    )
    parser.add_argument("source", type=Path, help="Path to the Scorecard SARIF file")
    parser.add_argument("target", type=Path, help="Path to write normalized SARIF")
    return parser.parse_args()


def main() -> None:
    """Normalize a Scorecard SARIF file from the command line."""
    args = parse_args()
    rewritten = normalize_scorecard_sarif(args.source, args.target)
    print(f"Normalized {rewritten} OSSF Scorecard SARIF entries")


if __name__ == "__main__":
    main()
