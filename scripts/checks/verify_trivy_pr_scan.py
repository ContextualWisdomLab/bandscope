"""Fail closed when Trivy code scanning cannot run on pull-request heads."""

from pathlib import Path

TRIVY_WORKFLOW = Path(".github/workflows/trivy.yml")


def main() -> int:
    """Require the Trivy workflow to cover PRs targeting protected branches."""
    workflow = TRIVY_WORKFLOW.read_text(encoding="utf-8")
    required_fragments = (
        "pull_request:",
        "      - develop",
        "      - main",
        "trivy-fs-scan:",
        "format: sarif",
        "github/codeql-action/upload-sarif@",
    )
    missing = [fragment for fragment in required_fragments if fragment not in workflow]
    if missing:
        print("Trivy PR code-scanning contract is incomplete:")
        for fragment in missing:
            print(f"- missing {fragment!r}")
        return 1
    print("Trivy PR code-scanning contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
