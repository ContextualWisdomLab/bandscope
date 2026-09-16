"""Regression tests for human-readable GitHub Action pin annotations."""

import re
from pathlib import Path


UPLOAD_SARIF_REFERENCE_RE = re.compile(
    r"^\s*-\s+uses:\s+github/codeql-action/upload-sarif@"
    r"(?P<sha>[0-9a-fA-F]{40})\s+#\s+v(?P<version>\d+\.\d+\.\d+)(?:\s|$)"
)


def test_upload_sarif_sha_annotations_are_complete_and_consistent() -> None:
    """Keep upload-sarif SHA pins and their review annotations in one identity."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow_dir = repo_root / ".github" / "workflows"
    workflow_paths = sorted(
        set(workflow_dir.glob("*.yml")) | set(workflow_dir.glob("*.yaml"))
    )
    references: list[tuple[str, str, str]] = []
    incomplete: list[str] = []

    for workflow_path in workflow_paths:
        for line_number, line in enumerate(
            workflow_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if (
                "github/codeql-action/upload-sarif@" not in line
                or line.lstrip().startswith("#")
            ):
                continue
            match = UPLOAD_SARIF_REFERENCE_RE.match(line)
            location = f"{workflow_path.relative_to(repo_root)}:{line_number}"
            if match is None:
                incomplete.append(location)
                continue
            references.append(
                (match.group("sha").lower(), match.group("version"), location)
            )

    assert not incomplete, (
        "upload-sarif pins must carry an adjacent semantic-version annotation: "
        + ", ".join(incomplete)
    )
    assert references, "repository workflows must contain a reviewed upload-sarif pin"

    identities = {(sha, version) for sha, version, _ in references}
    assert len(identities) == 1, (
        "upload-sarif workflows disagree on the reviewed SHA/version identity: "
        + ", ".join(
            f"{location}={sha}@v{version}" for sha, version, location in references
        )
    )
