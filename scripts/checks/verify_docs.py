from pathlib import Path
import sys


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


def main() -> int:
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

    if broken_refs:
        print("Missing required doc references:")
        for item in broken_refs:
            print(f"- {item}")
        return 1

    print("Documentation check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
