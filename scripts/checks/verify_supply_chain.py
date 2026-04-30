"""Verify that repository-controlled supply-chain controls stay in place."""

import re
import shlex
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
NPX_PACKAGE = re.compile(
    r"\bnpx\s+"
    r"(?!(?:(?:-y|--yes|--ignore-existing|--quiet)\s+)*--no-install\b)"
    r"(?:(?:-y|--yes|--ignore-existing|--quiet)\s+)*"
    r"(?:(?:--package(?:=|\s+)|-p\s+))?"
    r"`?(?P<package>@[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+)`?\b"
)
OSSF_DEFAULT_BRANCH_PUBLISH_GUARD = (
    "publish_results: ${{ github.ref == format('refs/heads/{0}', "
    "github.event.repository.default_branch) }}"
)
RELEASE_ARTIFACT_GLOB = re.compile(r"(?:^|\s)artifacts/\*")
RELEASE_ASSET_VALIDATOR = (
    "scripts/release/select_release_assets.py --output release-assets.txt"
)
RELEASE_ASSET_MAPFILE = "mapfile -t release_assets < release-assets.txt"
RELEASE_CREATE_VALUE_FLAGS = {
    "--discussion-category",
    "--latest",
    "--notes",
    "--notes-file",
    "--notes-start-tag",
    "--repo",
    "--target",
    "--title",
}
RELEASE_CREATE_ALLOWED_ASSET_TOKENS = {"${release_assets[@]}", "${release_assets[*]}"}


def logical_workflow_lines(content: str) -> list[tuple[int, str]]:
    """Return workflow lines with shell backslash continuations folded."""
    logical_lines: list[tuple[int, str]] = []
    pending = ""
    pending_start = 0
    for idx, raw_line in enumerate(content.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped and not pending:
            continue
        if pending:
            pending = f"{pending} {stripped}"
        else:
            pending = stripped
            pending_start = idx
        if pending.endswith("\\"):
            pending = pending[:-1].rstrip()
            continue
        logical_lines.append((pending_start, pending))
        pending = ""
        pending_start = 0
    if pending:
        logical_lines.append((pending_start, pending))
    return logical_lines


def yaml_scalar_value(stripped_line: str) -> str:
    """Return a simple YAML scalar value after the first colon."""
    return stripped_line.partition(":")[2].strip().strip("\"'")


def release_asset_allowlist_violation(path: Path) -> str:
    """Return the standard release asset allowlist violation for a workflow."""
    return (
        f"{path}: release asset upload must use an explicit allowlist, not artifacts/*"
    )


def add_release_asset_allowlist_violation(violations: list[str], path: Path) -> None:
    """Append the release asset allowlist violation once per workflow."""
    violation = release_asset_allowlist_violation(path)
    if violation not in violations:
        violations.append(violation)


def release_create_explicit_asset_tokens(command: str) -> list[str]:
    """Return non-allowlisted asset tokens from a gh release create command."""
    try:
        tokens = shlex.split(command)
    except ValueError:
        return [command]

    command_index = -1
    for idx in range(len(tokens) - 2):
        if tokens[idx : idx + 3] == ["gh", "release", "create"]:
            command_index = idx
            break
    if command_index < 0:
        return []

    explicit_assets: list[str] = []
    seen_tag = False
    idx = command_index + 3
    while idx < len(tokens):
        token = tokens[idx]
        if token == "--":
            explicit_assets.extend(tokens[idx + 1 :])
            break
        if token.startswith("--"):
            flag_name = token.split("=", maxsplit=1)[0]
            if "=" not in token and flag_name in RELEASE_CREATE_VALUE_FLAGS:
                idx += 2
            else:
                idx += 1
            continue
        if token.startswith("-"):
            idx += 1
            continue
        if not seen_tag:
            seen_tag = True
            idx += 1
            continue
        if token in RELEASE_CREATE_ALLOWED_ASSET_TOKENS:
            idx += 1
            continue
        explicit_assets.append(token)
        idx += 1
    return explicit_assets


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
    audit = read_workflow(
        Path(".github/workflows/security-audit.yml"), "security audit", missing
    )
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
    build = read_workflow(
        Path(".github/workflows/build-baseline.yml"), "build baseline", missing
    )
    for token in [
        "develop",
        "main",
        "pull_request",
        "push",
        "tags:",
        "windows-2025",
        "windows-11-arm",
        "macos-15-intel",
        "macos-15",
        "gate / build / windows",
        "gate / build / macos",
        "release-artifact / publish",
        "ubuntu-latest",
        "bandscope-windows-amd64-${{ github.sha }}",
        "bandscope-windows-arm64-${{ github.sha }}",
        "bandscope-macos-amd64-${{ github.sha }}",
        "bandscope-macos-arm64-${{ github.sha }}",
        "bandscope-release-sbom-${{ github.sha }}",
        "gh release create",
        "--draft",
        "--verify-tag",
        "Get-MpComputerStatus",
    ]:
        if build and token not in build:
            missing.append(f"build workflow missing token: {token}")
    if build and "windows-latest" in build:
        missing.append(
            "build workflow should not rely on windows-latest for architecture coverage"
        )
    if build and "macos-latest" in build:
        missing.append(
            "build workflow should not rely on macos-latest for architecture coverage"
        )
    scorecard = read_workflow(
        Path(".github/workflows/ossf-scorecard.yml"), "ossf scorecard", missing
    )
    if scorecard:
        missing.extend(
            f"ossf scorecard workflow missing token: {token}"
            for token in ["develop", "main", "push", "schedule", "ossf-scorecard"]
            if token not in scorecard
        )
        if "ossf/scorecard-action" in scorecard:
            if "github.event.repository.default_branch" not in scorecard:
                missing.append(
                    "ossf scorecard workflow must guard Scorecard execution to the repository default branch"
                )
            if (
                "publish_results:" in scorecard
                and OSSF_DEFAULT_BRANCH_PUBLISH_GUARD not in scorecard
            ):
                missing.append(
                    "ossf scorecard publish_results must use the repository default branch guard"
                )
    return missing


def verify_immutable_release_upload_policy() -> list[str]:
    """Return workflow violations that mutate immutable releases after publication."""
    violations: list[str] = []
    workflow_paths = sorted(Path(".github/workflows").glob("*.yml")) + sorted(
        Path(".github/workflows").glob("*.yaml")
    )
    for path in workflow_paths:
        content = path.read_text(encoding="utf-8")
        if "release:" not in content or "published" not in content:
            continue
        if "gh release upload" not in content:
            continue
        violations.append(
            f"{path}: release published workflows must not upload GitHub Release assets; "
            "immutable releases require draft-before-publish asset attachment"
        )
    return violations


def verify_workflow_npx_policy() -> list[str]:
    """Return workflow npx invocations that can fetch mutable npm packages."""
    violations: list[str] = []
    workflow_paths = sorted(Path(".github/workflows").glob("*.yml")) + sorted(
        Path(".github/workflows").glob("*.yaml")
    )
    for path in workflow_paths:
        for idx, line in logical_workflow_lines(path.read_text(encoding="utf-8")):
            package_match = NPX_PACKAGE.search(line)
            if package_match is None:
                continue
            package = package_match.group("package")
            violations.append(
                f"{path}:{idx} -> workflow npx package execution must use "
                f"npm exec or npx --no-install: {package}"
            )
    return violations


def verify_workflow_workspace_exec_policy() -> list[str]:
    """Return workflow npm workspace invocations that run from nested directories."""
    violations: list[str] = []
    workflow_paths = sorted(Path(".github/workflows").glob("*.yml")) + sorted(
        Path(".github/workflows").glob("*.yaml")
    )
    root_working_directories = {"", ".", "./", "${{ github.workspace }}"}

    for path in workflow_paths:
        workflow_default_directory = ""
        current_job_default_directory = ""
        current_job_indent: int | None = None
        workflow_defaults_indent: int | None = None
        workflow_defaults_run_indent: int | None = None
        job_defaults_indent: int | None = None
        job_defaults_run_indent: int | None = None
        in_jobs = False
        step_working_directory: str | None = None
        step_uses_workspace_exec = False

        def record_step_violation() -> None:
            effective_working_directory = (
                step_working_directory
                if step_working_directory is not None
                else current_job_default_directory or workflow_default_directory
            )
            if (
                step_uses_workspace_exec
                and effective_working_directory
                and effective_working_directory not in root_working_directories
            ):
                violations.append(
                    f"{path}: workflow npm exec --workspace commands must run from the repository root"
                )

        for line in [
            *path.read_text(encoding="utf-8").splitlines(),
            "      - name: sentinel",
        ]:
            indent = len(line) - len(line.lstrip(" "))
            stripped = line.strip()
            if not stripped:
                continue

            if (
                workflow_defaults_run_indent is not None
                and indent <= workflow_defaults_run_indent
            ):
                workflow_defaults_run_indent = None
            if (
                workflow_defaults_indent is not None
                and indent <= workflow_defaults_indent
            ):
                workflow_defaults_indent = None
            if (
                job_defaults_run_indent is not None
                and indent <= job_defaults_run_indent
            ):
                job_defaults_run_indent = None
            if job_defaults_indent is not None and indent <= job_defaults_indent:
                job_defaults_indent = None

            if indent == 0 and stripped == "defaults:":
                workflow_defaults_indent = indent
                workflow_defaults_run_indent = None
                continue
            if workflow_defaults_indent is not None and stripped == "run:":
                workflow_defaults_run_indent = indent
                continue
            if workflow_defaults_run_indent is not None and stripped.startswith(
                "working-directory:"
            ):
                workflow_default_directory = yaml_scalar_value(stripped)
                continue

            if indent == 0 and stripped == "jobs:":
                in_jobs = True
                continue
            if (
                in_jobs
                and indent == 2
                and stripped.endswith(":")
                and not stripped.startswith("-")
            ):
                record_step_violation()
                current_job_indent = indent
                current_job_default_directory = ""
                job_defaults_indent = None
                job_defaults_run_indent = None
                step_working_directory = None
                step_uses_workspace_exec = False
                continue
            if (
                current_job_indent is not None
                and indent == current_job_indent + 2
                and stripped == "defaults:"
            ):
                job_defaults_indent = indent
                job_defaults_run_indent = None
                continue
            if job_defaults_indent is not None and stripped == "run:":
                job_defaults_run_indent = indent
                continue
            if job_defaults_run_indent is not None and stripped.startswith(
                "working-directory:"
            ):
                current_job_default_directory = yaml_scalar_value(stripped)
                continue

            if re.match(r"^-\s+(name|uses|run):", stripped):
                record_step_violation()
                step_working_directory = None
                step_uses_workspace_exec = False

            if stripped.startswith("working-directory:"):
                step_working_directory = yaml_scalar_value(stripped)
            if "npm exec --workspace" in stripped:
                step_uses_workspace_exec = True

    return violations


def verify_release_asset_allowlist_policy() -> list[str]:
    """Return release workflows that upload arbitrary artifact directory contents."""
    violations: list[str] = []
    workflow_paths = sorted(Path(".github/workflows").glob("*.yml")) + sorted(
        Path(".github/workflows").glob("*.yaml")
    )
    for path in workflow_paths:
        content = path.read_text(encoding="utf-8")
        if "gh release create" not in content:
            continue
        if (
            RELEASE_ASSET_VALIDATOR not in content
            or RELEASE_ASSET_MAPFILE not in content
        ):
            violations.append(
                f"{path}: release asset upload must use scripts/release/select_release_assets.py"
            )
        in_release_assets = False
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("release_assets=("):
                in_release_assets = True
            if in_release_assets and RELEASE_ARTIFACT_GLOB.search(line):
                add_release_asset_allowlist_violation(violations, path)
                break
            if in_release_assets and stripped == ")":
                in_release_assets = False

        for _, line in logical_workflow_lines(content):
            if "gh release create" not in line:
                continue
            if RELEASE_ARTIFACT_GLOB.search(
                line
            ) or release_create_explicit_asset_tokens(line):
                add_release_asset_allowlist_violation(violations, path)
                break
    return violations


def main() -> int:
    """Return a failing exit code when supply-chain controls are incomplete."""
    violations: list[str] = []
    violations.extend(f"missing file: {item}" for item in verify_required_files())
    violations.extend(verify_pinned_actions())
    violations.extend(verify_dependabot_coverage())
    violations.extend(verify_workflow_coverage())
    violations.extend(verify_immutable_release_upload_policy())
    violations.extend(verify_release_asset_allowlist_policy())
    violations.extend(verify_workflow_npx_policy())
    violations.extend(verify_workflow_workspace_exec_policy())

    if violations:
        print("Supply-chain verification failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Supply-chain verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
