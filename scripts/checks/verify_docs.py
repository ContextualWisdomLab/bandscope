"""Verify that required repository documentation files and references exist."""

import re
from pathlib import Path

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
    Path("docs/architecture/diagrams.md"),
    Path("docs/README.md"),
    Path("docs/PRD.md"),
    Path("docs/TRD.md"),
    Path("docs/adr/README.md"),
    Path("docs/adr/0001-source-separation-runtime-and-model-delivery.md"),
    Path("docs/adr/0002-known-stem-youtube-quality-gate.md"),
    Path("docs/adr/0003-ephemeral-benchmark-evidence-model.md"),
    Path("docs/documentation-coverage-matrix.md"),
    Path("docs/doctoring/real-audio-accuracy-acceptance.md"),
    Path("docs/i18n/i18n-policy.md"),
    Path("docs/release/release-policy.md"),
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
    Path("CONTRIBUTING.md"): ["docs/security/github-required-checks.md"],
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
        "docs/PRD.md",
        "docs/TRD.md",
        "docs/adr/README.md",
        "docs/architecture/diagrams.md",
    ],
    Path("docs/README.md"): [
        "docs/PRD.md",
        "docs/TRD.md",
        "docs/adr/README.md",
        "docs/architecture/diagrams.md",
        "docs/documentation-coverage-matrix.md",
    ],
    Path("docs/repository/bootstrap-plan.md"): ["docs/security/github-required-checks.md"],
    Path("docs/repository/gitflow.md"): ["docs/security/github-required-checks.md"],
    Path("docs/repository/governance.md"): ["docs/security/github-required-checks.md"],
    Path("docs/security/github-required-checks.md"): [
        "## Review-equivalent evidence",
        "exact current PR head SHA",
        "independent non-author",
        "Status contexts, check runs, reactions, issue comments",
        "defer that merge",
    ],
    Path("docs/workflow/github-bootstrap-execution-policy.md"): [
        "docs/security/github-required-checks.md"
    ],
}


def documentation_violations(root: Path = Path(".")) -> list[str]:
    """Return missing canonical files and broken authority-reference violations."""
    violations = [f"missing file: {path}" for path in REQUIRED_PATHS if not (root / path).exists()]
    for path, required_texts in REQUIRED_REFERENCES.items():
        absolute_path = root / path
        if not absolute_path.exists():
            continue
        content = absolute_path.read_text(encoding="utf-8")
        for required_text in required_texts:
            if required_text not in content:
                violations.append(f"{path} missing reference: {required_text}")
    plans_root = root / "docs" / "plans"
    if plans_root.exists():
        security_heading = re.compile(r"^## Security Notes\s*$", re.MULTILINE)
        for absolute_path in sorted(plans_root.rglob("*.md")):
            content = absolute_path.read_text(encoding="utf-8")
            if security_heading.search(content) is None:
                relative_path = absolute_path.relative_to(root)
                violations.append(f"{relative_path} missing section: ## Security Notes")
    return violations


def main() -> int:
    """Return a failing exit code when required docs or references are missing."""
    violations = documentation_violations()

    if violations:
        print("Documentation check failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Documentation check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
