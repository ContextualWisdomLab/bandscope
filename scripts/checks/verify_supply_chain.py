"""Verify that repository-controlled supply-chain controls stay in place."""

import re
from pathlib import Path

REQUIRED_FILES = [
    Path("package-lock.json"),
    Path("services/analysis-engine/uv.lock"),
    Path("apps/desktop/src-tauri/Cargo.lock"),
    Path(".github/dependabot.yml"),
    Path(".github/workflows/dependency-review.yml"),
    Path(".github/workflows/security-audit.yml"),
    Path(".github/workflows/codeql.yml"),
    Path(".github/workflows/sbom.yml"),
    Path(".github/workflows/release.yml"),
    Path(".github/workflows/secret-scan-gate.yml"),
    Path(".github/workflows/build-baseline.yml"),
    Path(".github/workflows/ossf-scorecard.yml"),
    Path("docs/security/dependency-policy.md"),
    Path("docs/security/sbom-policy.md"),
    Path("docs/security/code-security.md"),
    Path("docs/security/cross-platform-build-policy.md"),
    Path("docs/security/github-required-checks.md"),
    Path("supply-chain/supplemental-component-inventory.json"),
]

PINNED_ACTION = re.compile(r"^\s*-?\s*uses:\s+[^@\s]+@[0-9a-f]{40}(\s+#.*)?$")
LOCAL_ACTION = re.compile(r"^\s*-?\s*uses:\s+\./")
DOCKER_ACTION = re.compile(r"^\s*-?\s*uses:\s+docker://")


def verify_required_files() -> list[str]:
    """Return missing files required by the supply-chain baseline."""
    return [str(path) for path in REQUIRED_FILES if not path.exists()]


def verify_pinned_actions() -> list[str]:
    """Return workflow actions that are not pinned to immutable SHAs."""
    violations: list[str] = []
    workflow_paths = sorted(Path(".github/workflows").glob("*.yml")) + sorted(
        Path(".github/workflows").glob("*.yaml")
    )
    for path in workflow_paths:
        for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if "uses:" not in line:
                continue
            if PINNED_ACTION.match(line) or LOCAL_ACTION.match(line) or DOCKER_ACTION.match(line):
                continue
            violations.append(f"{path}:{idx} -> workflow action must be pinned by SHA")
    return violations


def verify_dependabot_coverage() -> list[str]:
    """Return missing Dependabot ecosystems from the repo configuration."""
    path = Path(".github/dependabot.yml")
    if not path.exists():
        return [f"missing file: {path}"]
    content = path.read_text(encoding="utf-8")
    missing: list[str] = []
    for ecosystem in ["npm", "pip", "cargo", "github-actions"]:
        if f'package-ecosystem: "{ecosystem}"' not in content:
            missing.append(f"dependabot missing ecosystem: {ecosystem}")
    return missing


def read_workflow(path: Path, label: str, missing: list[str]) -> str:
    """Read a workflow file, recording a missing-file violation when absent."""
    if not path.exists():
        missing.append(f"missing file: {path}")
        return ""
    return path.read_text(encoding="utf-8")


def verify_workflow_coverage() -> list[str]:
    """Return workflow trigger and artifact coverage violations."""
    missing: list[str] = []
    ci = read_workflow(Path(".github/workflows/ci.yml"), "ci", missing)
    for token in ["develop", "main", "pull_request", "push", "ci / build-and-test"]:
        if ci and token not in ci:
            missing.append(f"ci workflow missing token: {token}")
    sbom = read_workflow(Path(".github/workflows/sbom.yml"), "sbom", missing)
    for token in ["develop", "main", "pull_request", "release:", "tags:"]:
        if sbom and token not in sbom:
            missing.append(f"sbom workflow missing trigger token: {token}")
    review = read_workflow(
        Path(".github/workflows/dependency-review.yml"), "dependency review", missing
    )
    for token in ["develop", "main", "pull_request"]:
        if review and token not in review:
            missing.append(f"dependency review workflow missing trigger token: {token}")
    audit = read_workflow(Path(".github/workflows/security-audit.yml"), "security audit", missing)
    for token in ["develop", "main", "pull_request", "push"]:
        if audit and token not in audit:
            missing.append(f"security audit workflow missing trigger token: {token}")
    codeql = read_workflow(Path(".github/workflows/codeql.yml"), "codeql", missing)
    for token in ["develop", "main", "pull_request", "push", "codeql"]:
        if codeql and token not in codeql:
            missing.append(f"codeql workflow missing token: {token}")
    release = read_workflow(Path(".github/workflows/release.yml"), "release", missing)
    for token in [
        "develop",
        "main",
        "pull_request",
        "push",
        "tags:",
        "release-preflight",
    ]:
        if release and token not in release:
            missing.append(f"release workflow missing token: {token}")
    secret_scan = read_workflow(
        Path(".github/workflows/secret-scan-gate.yml"), "secret scan", missing
    )
    for token in ["develop", "main", "pull_request", "push", "secret-scan-gate"]:
        if secret_scan and token not in secret_scan:
            missing.append(f"secret scan workflow missing token: {token}")
    build = read_workflow(Path(".github/workflows/build-baseline.yml"), "build baseline", missing)
    for token in [
        "develop",
        "main",
        "pull_request",
        "push",
        "release:",
        "tags:",
        "windows-2025",
        "windows-11-arm",
        "macos-15-intel",
        "macos-15",
        "gate / build / windows",
        "gate / build / macos",
        "release-artifact / macos",
        "release-artifact / windows",
        "ubuntu-latest",
        "bandscope-windows-amd64-${{ github.sha }}",
        "bandscope-windows-arm64-${{ github.sha }}",
        "bandscope-macos-amd64-${{ github.sha }}",
        "bandscope-macos-arm64-${{ github.sha }}",
        "Get-MpComputerStatus",
    ]:
        if build and token not in build:
            missing.append(f"build workflow missing token: {token}")
    if build and "windows-latest" in build:
        missing.append("build workflow should not rely on windows-latest for architecture coverage")
    if build and "macos-latest" in build:
        missing.append("build workflow should not rely on macos-latest for architecture coverage")
    scorecard = read_workflow(
        Path(".github/workflows/ossf-scorecard.yml"), "ossf scorecard", missing
    )
    if scorecard:
        missing.extend(
            f"ossf scorecard workflow missing token: {token}"
            for token in ["develop", "main", "push", "schedule", "ossf-scorecard"]
            if token not in scorecard
        )
    return missing


def main() -> int:
    """Return a failing exit code when supply-chain controls are incomplete."""
    violations: list[str] = []
    violations.extend(f"missing file: {item}" for item in verify_required_files())
    violations.extend(verify_pinned_actions())
    violations.extend(verify_dependabot_coverage())
    violations.extend(verify_workflow_coverage())

    if violations:
        print("Supply-chain verification failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Supply-chain verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
