from pathlib import Path
import re


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
    return [str(path) for path in REQUIRED_FILES if not path.exists()]


def verify_pinned_actions() -> list[str]:
    violations: list[str] = []
    for path in Path(".github/workflows").glob("*.yml"):
        for idx, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if "uses:" not in line:
                continue
            if (
                PINNED_ACTION.match(line)
                or LOCAL_ACTION.match(line)
                or DOCKER_ACTION.match(line)
            ):
                continue
            violations.append(f"{path}:{idx} -> workflow action must be pinned by SHA")
    return violations


def verify_dependabot_coverage() -> list[str]:
    path = Path(".github/dependabot.yml")
    content = path.read_text(encoding="utf-8")
    missing: list[str] = []
    for ecosystem in ["npm", "pip", "cargo", "github-actions"]:
        if f'package-ecosystem: "{ecosystem}"' not in content:
            missing.append(f"dependabot missing ecosystem: {ecosystem}")
    return missing


def verify_workflow_coverage() -> list[str]:
    missing: list[str] = []
    sbom = Path(".github/workflows/sbom.yml").read_text(encoding="utf-8")
    for token in ["develop", "main", "pull_request", "release:", "tags:"]:
        if token not in sbom:
            missing.append(f"sbom workflow missing trigger token: {token}")
    review = Path(".github/workflows/dependency-review.yml").read_text(encoding="utf-8")
    for token in ["develop", "main", "pull_request"]:
        if token not in review:
            missing.append(f"dependency review workflow missing trigger token: {token}")
    audit = Path(".github/workflows/security-audit.yml").read_text(encoding="utf-8")
    for token in ["develop", "main", "pull_request", "push"]:
        if token not in audit:
            missing.append(f"security audit workflow missing trigger token: {token}")
    codeql = Path(".github/workflows/codeql.yml").read_text(encoding="utf-8")
    for token in ["develop", "main", "pull_request", "push", "codeql"]:
        if token not in codeql:
            missing.append(f"codeql workflow missing token: {token}")
    release = Path(".github/workflows/release.yml").read_text(encoding="utf-8")
    for token in [
        "develop",
        "main",
        "pull_request",
        "push",
        "tags:",
        "release-preflight",
    ]:
        if token not in release:
            missing.append(f"release workflow missing token: {token}")
    secret_scan = Path(".github/workflows/secret-scan-gate.yml").read_text(
        encoding="utf-8"
    )
    for token in ["develop", "main", "pull_request", "push", "secret-scan-gate"]:
        if token not in secret_scan:
            missing.append(f"secret scan workflow missing token: {token}")
    build = Path(".github/workflows/build-baseline.yml").read_text(encoding="utf-8")
    for token in [
        "develop",
        "main",
        "pull_request",
        "push",
        "release:",
        "tags:",
        "windows-latest",
        "macos-latest",
        "gate / build / windows",
        "gate / build / macos",
    ]:
        if token not in build:
            missing.append(f"build workflow missing token: {token}")
    return missing


def main() -> int:
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
