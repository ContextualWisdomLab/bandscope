"""Safely extract the OSSF Scorecard SARIF artifact downloaded as a ZIP."""

from __future__ import annotations

import argparse
import stat
import zipfile
from pathlib import Path

EXPECTED_MEMBER = "results.sarif"


def resolve_artifact_zip(source: Path) -> Path:
    """Return the artifact ZIP file from a file path or single-ZIP directory."""
    if source.is_file():
        return source
    if not source.is_dir():
        raise ValueError(f"artifact source does not exist: {source}")
    candidates = sorted(path for path in source.iterdir() if path.suffix == ".zip")
    if len(candidates) != 1:
        raise ValueError(
            f"expected exactly one Scorecard artifact zip in {source}, found {len(candidates)}"
        )
    return candidates[0]


def validate_member(member: zipfile.ZipInfo) -> None:
    """Reject unexpected or unsafe ZIP members."""
    member_path = Path(member.filename)
    unix_mode = member.external_attr >> 16
    if (
        member.filename != EXPECTED_MEMBER
        or member_path.is_absolute()
        or ".." in member_path.parts
        or member.is_dir()
        or stat.S_ISLNK(unix_mode)
    ):
        raise ValueError(f"unexpected artifact member: {member.filename}")


def extract_scorecard_artifact(source: Path, output_dir: Path) -> Path:
    """Extract exactly ``results.sarif`` into ``output_dir`` and return its path."""
    artifact_zip = resolve_artifact_zip(source)
    with zipfile.ZipFile(artifact_zip) as archive:
        members = archive.infolist()
        for member in members:
            validate_member(member)
        if [member.filename for member in members] != [EXPECTED_MEMBER]:
            raise ValueError("expected only results.sarif in Scorecard artifact")
        member = members[0]
        output_dir.mkdir(parents=True, exist_ok=True)
        target = output_dir / EXPECTED_MEMBER
        target.write_bytes(archive.read(member))
        return target


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Safely extract a zipped OSSF Scorecard SARIF artifact."
    )
    parser.add_argument(
        "source",
        type=Path,
        help="Artifact ZIP file or directory containing exactly one artifact ZIP",
    )
    parser.add_argument("output_dir", type=Path, help="Directory for results.sarif")
    return parser.parse_args()


def main() -> None:
    """Run the extractor from the command line."""
    args = parse_args()
    extracted = extract_scorecard_artifact(args.source, args.output_dir)
    print(f"Extracted OSSF Scorecard SARIF to {extracted}")


if __name__ == "__main__":
    main()
