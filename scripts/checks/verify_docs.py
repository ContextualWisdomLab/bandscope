"""Verify that required repository documentation files and references exist."""

from pathlib import Path
from collections.abc import Sequence

REQUIRED_PATHS = [
    Path("README.md"),
    Path("LICENSE"),
    Path("CONTRIBUTING.md"),
    Path("CODE_OF_CONDUCT.md"),
    Path("AGENTS.md"),
    Path("ARCHITECTURE.md"),
    Path("SECURITY.md"),
    Path("docs/brand-story.md"),
    Path("docs/repository/governance.md"),
    Path("docs/repository/bootstrap-plan.md"),
    Path("docs/repository/gitflow.md"),
    Path("docs/architecture/overview.md"),
    Path("docs/i18n/i18n-policy.md"),
    Path("docs/release/release-policy.md"),
    Path("docs/product-technical-gap-baseline.md"),
    Path(".github/CODEOWNERS"),
    Path(".github/PULL_REQUEST_TEMPLATE.md"),
    Path(".github/ISSUE_TEMPLATE/bug_report.yml"),
    Path(".github/ISSUE_TEMPLATE/feature_request.yml"),
    Path(".github/ISSUE_TEMPLATE/config.yml"),
    Path("docs/security/app-security.md"),
    Path("docs/security/dependency-policy.md"),
    Path("docs/security/sbom-policy.md"),
    Path("docs/security/code-security.md"),
    Path("docs/security/cross-platform-build-policy.md"),
    Path("docs/security/github-required-checks.md"),
    Path("docs/workflow/github-bootstrap-execution-policy.md"),
    Path("docs/plans/2026-03-10-bandscope-harness-design.md"),
    Path("docs/plans/2026-03-10-bandscope-harness.md"),
    Path("docs/plans/2026-03-10-bandscope-supply-chain-design.md"),
    Path("docs/plans/2026-03-10-bandscope-supply-chain.md"),
    Path("docs/plans/2026-03-10-bandscope-cross-platform-build-design.md"),
    Path("docs/plans/2026-03-10-bandscope-cross-platform-build.md"),
]

REQUIRED_REFERENCES = {
    Path("README.md"): [
        "docs/security/app-security.md",
        "docs/security/dependency-policy.md",
        "docs/repository/gitflow.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/workflow/github-bootstrap-execution-policy.md",
    ],
    Path("AGENTS.md"): [
        "docs/security/app-security.md",
        "docs/security/dependency-policy.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/workflow/github-bootstrap-execution-policy.md",
        "Security Notes",
    ],
    Path("ARCHITECTURE.md"): [
        "docs/security/app-security.md",
        "docs/security/dependency-policy.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/workflow/github-bootstrap-execution-policy.md",
    ],
}

REQUIRED_STATE_DIAGRAM_REFERENCES = {
    Path("docs/product-technical-gap-baseline.md"): (
        "NoSource --> RecoveringWithoutSource: project recovery requested",
        "Ready --> RecoveringWithSource: project recovery requested",
        "RecoveryFailedWithoutSource --> NoSource: recovery failure acknowledged",
        "RecoveryFailedWithSource --> Ready: recovery failure acknowledged / keep prior source",
    ),
}


def mermaid_state_diagrams(content: str) -> list[str]:
    """Return only closed Mermaid fences whose diagram type is stateDiagram-v2."""
    diagrams: list[str] = []
    lines = content.splitlines()
    index = 0

    while index < len(lines):
        if lines[index].strip() != "```mermaid":
            index += 1
            continue

        index += 1
        block: list[str] = []
        closed = False
        while index < len(lines):
            if lines[index].strip() == "```":
                closed = True
                break
            block.append(lines[index])
            index += 1

        if closed:
            first_content_line = next(
                (line.strip() for line in block if line.strip()),
                "",
            )
            if first_content_line == "stateDiagram-v2":
                diagrams.append("\n".join(block))

        index += 1

    return diagrams


def missing_state_diagram_references(
    content: str,
    required_texts: Sequence[str],
) -> list[str]:
    """Require related transitions to coexist in one Mermaid state diagram."""
    diagrams = mermaid_state_diagrams(content)
    if any(all(required_text in diagram for required_text in required_texts) for diagram in diagrams):
        return []
    return list(required_texts)


def main() -> int:
    """Return a failing exit code when required docs or references are missing."""
    missing = [str(path) for path in REQUIRED_PATHS if not path.exists()]
    if missing:
        print("Missing required docs:")
        for path in missing:
            print(f"- {path}")
        return 1

    broken_refs: list[str] = []
    for path, required_texts in REQUIRED_REFERENCES.items():
        content = path.read_text(encoding="utf-8")
        for required_text in required_texts:
            if required_text not in content:
                broken_refs.append(f"{path} missing reference: {required_text}")

    for path, required_texts in REQUIRED_STATE_DIAGRAM_REFERENCES.items():
        content = path.read_text(encoding="utf-8")
        missing_transitions = missing_state_diagram_references(content, required_texts)
        if missing_transitions:
            broken_refs.append(
                f"{path} missing required transitions from one Mermaid stateDiagram-v2: "
                + "; ".join(missing_transitions)
            )

    if broken_refs:
        print("Missing required doc references:")
        for item in broken_refs:
            print(f"- {item}")
        return 1

    print("Documentation check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
