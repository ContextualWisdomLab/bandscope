"""Verify that repository-controlled supply-chain controls stay in place."""

import ast
import re
import shlex
from itertools import pairwise
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
PACKAGE_SPEC = re.compile(
    r"^(?:@[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+)"
    r"(?:@[A-Za-z0-9_.~^<>=*-]+)?$"
)
NPX_FLAG_OPTIONS = {"-y", "--yes", "--ignore-existing", "--quiet"}
NPX_PACKAGE_OPTIONS = {"-p", "--package"}
NPX_VALUE_OPTIONS = {"-c", "--call", "--shell"}
OSSF_DEFAULT_BRANCH_PUBLISH_GUARD = (
    "publish_results: ${{ github.ref == format('refs/heads/{0}', "
    "github.event.repository.default_branch) }}"
)
OSSF_PUBLISH_USES_ONLY_VIOLATION = (
    "ossf scorecard publishing job must only contain uses steps; split run steps "
    "into a separate non-publishing job"
)
OSSF_SARIF_NORMALIZER = "scripts/checks/normalize_scorecard_sarif.py"
OSSF_NORMALIZED_SARIF = "normalized-scorecard-results.sarif"
OSSF_NORMALIZED_SARIF_UPLOAD = f"sarif_file: {OSSF_NORMALIZED_SARIF}"
RELEASE_ARTIFACT_GLOB = re.compile(r"(?:^|\s)artifacts/\*")
RELEASE_ASSET_VALIDATOR = (
    "scripts/release/select_release_assets.py --output release-assets.txt"
)
RELEASE_ASSET_MAPFILE = "mapfile -t release_assets < release-assets.txt"
WORKSPACE_EXEC_PATTERN = re.compile(r"\bnpm\s+exec\s+--workspace\b")
RUST_RAND_ADVISORY_ID = "GHSA-cq8v-f236-94qc"
RUST_RAND_RETIRED_LEGACY_VERSION = "0.7.3"
RUST_RAND_PATCHED_VERSIONS = {
    (0, 8): (0, 8, 6),
    (0, 9): (0, 9, 3),
    (0, 10): (0, 10, 1),
}
RUST_GLIB_ADVISORY_ID = "RUSTSEC-2024-0429"
RUST_GLIB_LEGACY_EXCEPTION_VERSION = "0.18.5"
RUST_GLIB_PATCHED_VERSION = (0, 20, 0)
RUST_GLIB_LEGACY_ROOT_NAME = "tauri"
RUST_GLIB_LEGACY_EXCEPTION_PACKAGE = "glib 0.18.5"
RUST_GLIB_LEGACY_DIRECT_OWNER_NAMES = {
    "atk",
    "cairo-rs",
    "gdk",
    "gdk-pixbuf",
    "gio",
    "gtk",
    "javascriptcore-rs",
    "pango",
    "soup3",
    "webkit2gtk",
}
RUST_GLIB_LEGACY_ALLOWED_ANCESTOR_NAMES = RUST_GLIB_LEGACY_DIRECT_OWNER_NAMES | {
    "muda",
    "tao",
    RUST_GLIB_LEGACY_ROOT_NAME,
    "tauri-runtime",
    "tauri-runtime-wry",
    "wry",
}
RUST_GLIB_LEGACY_ALLOWED_APP_ROOT_NAMES = {"bandscope-desktop"}
RUST_GLIB_LEGACY_EXPECTED_CHAIN_NAMES = (
    RUST_GLIB_LEGACY_ROOT_NAME,
    "tauri-runtime-wry",
    "wry",
    "webkit2gtk",
    "gtk",
    "glib",
)
RUST_FASTRAND_YANKED_VERSION = "2.4.0"
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


def clean_package_token(token: str) -> str:
    """Return a normalized package token stripped of shell quoting wrappers."""
    return token.strip().strip("`").strip()


def npx_package_from_command(command: str) -> str | None:
    """Return the package fetched by an unsafe npx command, when present."""
    try:
        tokens = shlex.split(command)
    except ValueError:
        tokens = command.split()

    for npx_index, token in enumerate(tokens):
        if token != "npx":
            continue
        no_install = False
        idx = npx_index + 1
        while idx < len(tokens):
            current = tokens[idx]
            if current == "--no-install":
                no_install = True
                idx += 1
                continue
            if current in NPX_FLAG_OPTIONS:
                idx += 1
                continue
            if current in NPX_PACKAGE_OPTIONS:
                if idx + 1 >= len(tokens):
                    return None
                package = clean_package_token(tokens[idx + 1])
                return None if no_install else package
            if current.startswith("--package="):
                package = clean_package_token(current.partition("=")[2])
                return None if no_install else package
            if current.startswith("-p") and current != "-p":
                package = clean_package_token(current[2:])
                return None if no_install else package
            if current in NPX_VALUE_OPTIONS:
                idx += 2
                continue
            if current.startswith("--") and "=" in current:
                idx += 1
                continue
            if current.startswith("-"):
                idx += 1
                continue
            package = clean_package_token(current)
            if PACKAGE_SPEC.fullmatch(package) is None:
                return None
            return None if no_install else package
    return None


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


def ossf_scorecard_publish_restriction_violations(
    content: str, path: Path | None = None
) -> list[str]:
    """Return OSSF publishing job violations that GitHub cannot publish."""
    violations: list[str] = []
    current_job_lines: list[str] = []
    current_job_start_line = 0
    in_jobs = False

    def evaluate_job(job_lines: list[str], start_line: int) -> None:
        if not job_lines:
            return
        job_content = "\n".join(job_lines)
        if "ossf/scorecard-action" not in job_content:
            return
        if "publish_results:" not in job_content:
            return
        has_run_step = any(
            stripped.startswith("run:") or re.match(r"^-\s+run:", stripped)
            for stripped in (line.strip() for line in job_lines)
        )
        if has_run_step:
            if path is None:
                violations.append(OSSF_PUBLISH_USES_ONLY_VIOLATION)
            else:
                violations.append(
                    f"{path}:{start_line or 1} -> {OSSF_PUBLISH_USES_ONLY_VIOLATION}"
                )

    for idx, line in enumerate(content.splitlines(), start=1):
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()
        if indent == 0 and stripped == "jobs:":
            in_jobs = True
            continue
        if not in_jobs:
            continue
        if indent == 0 and stripped:
            evaluate_job(current_job_lines, current_job_start_line)
            current_job_lines = []
            current_job_start_line = 0
            in_jobs = False
            continue
        if indent == 2 and stripped.endswith(":") and not stripped.startswith("-"):
            evaluate_job(current_job_lines, current_job_start_line)
            current_job_lines = [line]
            current_job_start_line = idx
            continue
        current_job_lines.append(line)

    evaluate_job(current_job_lines, current_job_start_line)
    return violations


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
                    "ossf scorecard workflow must guard Scorecard execution to "
                    "the repository default branch"
                )
            if (
                "publish_results:" in scorecard
                and OSSF_DEFAULT_BRANCH_PUBLISH_GUARD not in scorecard
            ):
                missing.append(
                    "ossf scorecard publish_results must use the repository default branch guard"
                )
            if "github/codeql-action/upload-sarif" in scorecard and (
                OSSF_SARIF_NORMALIZER not in scorecard
                or OSSF_NORMALIZED_SARIF_UPLOAD not in scorecard
            ):
                missing.append(
                    "ossf scorecard SARIF upload must normalize repository-level "
                    "placeholder URIs before upload-sarif"
                )
        workflow_paths = sorted(Path(".github/workflows").glob("*.yml")) + sorted(
            Path(".github/workflows").glob("*.yaml")
        )
        for workflow_path in workflow_paths:
            missing.extend(
                ossf_scorecard_publish_restriction_violations(
                    workflow_path.read_text(encoding="utf-8"), workflow_path
                )
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
            package = npx_package_from_command(line)
            if package is None:
                continue
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
        content = path.read_text(encoding="utf-8")
        workspace_exec_lines = {
            line_number
            for line_number, logical_line in logical_workflow_lines(content)
            if WORKSPACE_EXEC_PATTERN.search(logical_line)
        }
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

        def record_step_violation(
            current_step_working_directory: str | None,
            job_default_directory: str,
            default_directory: str,
            uses_workspace_exec: bool,
            workflow_path: Path,
        ) -> None:
            effective_working_directory = (
                current_step_working_directory
                if current_step_working_directory is not None
                else job_default_directory or default_directory
            )
            if (
                uses_workspace_exec
                and effective_working_directory
                and effective_working_directory not in root_working_directories
            ):
                violations.append(
                    f"{workflow_path}: workflow npm exec --workspace commands "
                    "must run from the repository root"
                )

        lines_with_sentinel = [*content.splitlines(), "      - name: sentinel"]
        for line_number, line in enumerate(lines_with_sentinel, start=1):
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
                record_step_violation(
                    step_working_directory,
                    current_job_default_directory,
                    workflow_default_directory,
                    step_uses_workspace_exec,
                    path,
                )
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
                record_step_violation(
                    step_working_directory,
                    current_job_default_directory,
                    workflow_default_directory,
                    step_uses_workspace_exec,
                    path,
                )
                step_working_directory = None
                step_uses_workspace_exec = False

            if stripped.startswith("working-directory:"):
                step_working_directory = yaml_scalar_value(stripped)
            if (
                WORKSPACE_EXEC_PATTERN.search(stripped)
                or line_number in workspace_exec_lines
            ):
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


def rust_dependency_advisory_violations(
    lockfile: Path = Path("apps/desktop/src-tauri/Cargo.lock"),
) -> list[str]:
    """Return Rust lockfile dependency versions with known required patches."""
    violations: list[str] = []
    if not lockfile.exists():
        return [f"Cargo.lock missing: {lockfile}"]
    package_dependencies = cargo_lock_package_dependencies(lockfile)
    glib_exception_owned_packages = cargo_lock_reachable_package_keys_by_name(
        package_dependencies, RUST_GLIB_LEGACY_ROOT_NAME
    )
    legacy_glib_ancestors = cargo_lock_dependency_ancestors(
        package_dependencies, RUST_GLIB_LEGACY_EXCEPTION_PACKAGE
    )
    legacy_glib_direct_owners = cargo_lock_dependency_owners(
        package_dependencies, RUST_GLIB_LEGACY_EXCEPTION_PACKAGE
    )
    for package in cargo_lock_packages(lockfile):
        current_name = str(package.get("name", ""))
        version = str(package.get("version", ""))
        if current_name == "fastrand" and version == RUST_FASTRAND_YANKED_VERSION:
            violations.append(
                f"{lockfile}: fastrand {version} is yanked and must stay updated"
            )
            continue
        if current_name != "rand":
            if current_name == "glib":
                violations.extend(
                    rust_glib_advisory_violations(
                        lockfile,
                        version,
                        package_dependencies,
                        legacy_glib_ancestors,
                        legacy_glib_direct_owners,
                        glib_exception_owned_packages,
                    )
                )
            continue
        if version == RUST_RAND_RETIRED_LEGACY_VERSION:
            violations.append(
                f"{lockfile}: rand {version} is not allowed for "
                f"{RUST_RAND_ADVISORY_ID}; the former legacy owner-chain "
                "exception has been removed"
            )
            continue
        parsed_parts: list[int] = []
        segments = version.split(".")
        if any(not segment.isdecimal() for segment in segments):
            violations.append(
                f"{lockfile}: rand {version} has a non-numeric version segment "
                f"for {RUST_RAND_ADVISORY_ID}"
            )
            continue
        if len(segments) > 3:
            violations.append(
                f"{lockfile}: rand {version} has a non-standard extra version segment "
                f"for {RUST_RAND_ADVISORY_ID}"
            )
            continue
        for part in segments:
            parsed_parts.append(int(part))
        if len(parsed_parts) != len(segments):
            continue
        while len(parsed_parts) < 3:
            parsed_parts.append(0)
        parts = tuple(parsed_parts[:3])
        rand_series = (parts[0], parts[1])
        if rand_series == (0, 7):
            violations.append(
                f"{lockfile}: rand {version} is not allowed for "
                f"{RUST_RAND_ADVISORY_ID}; the former legacy owner-chain "
                "exception has been removed"
            )
            continue
        patched_version = RUST_RAND_PATCHED_VERSIONS.get(rand_series)
        if patched_version is not None and parts < patched_version:
            patched = ".".join(str(part) for part in patched_version)
            violations.append(
                f"{lockfile}: rand {version} is below patched {patched} "
                f"for {RUST_RAND_ADVISORY_ID}"
            )
    return violations


def rust_glib_advisory_violations(
    lockfile: Path,
    version: str,
    package_dependencies: dict[str, list[str]],
    legacy_glib_ancestors: set[str],
    legacy_glib_direct_owners: set[str],
    glib_exception_owned_packages: set[str],
) -> list[str]:
    """Return violations for vulnerable glib versions outside the Tauri GTK stack."""
    if version == RUST_GLIB_LEGACY_EXCEPTION_VERSION:
        if glib_legacy_exception_owners_are_allowed(
            package_dependencies,
            legacy_glib_ancestors,
            glib_exception_owned_packages,
            legacy_glib_direct_owners,
        ):
            return []
        return [
            f"{lockfile}: glib {version} matches the legacy exception version but "
            "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
            f"for {RUST_GLIB_ADVISORY_ID}"
        ]

    version_violation = unsupported_numeric_semver_violation(
        lockfile, "glib", version, RUST_GLIB_ADVISORY_ID
    )
    if version_violation is not None:
        return [version_violation]
    parsed_version = parse_numeric_semver(version)
    if parsed_version is None:  # Defensive; unsupported forms returned above.
        return [
            f"{lockfile}: glib {version} has an unsupported version form "
            f"for {RUST_GLIB_ADVISORY_ID}"
        ]
    if parsed_version < RUST_GLIB_PATCHED_VERSION:
        patched = ".".join(str(part) for part in RUST_GLIB_PATCHED_VERSION)
        return [
            f"{lockfile}: glib {version} is below patched {patched} "
            f"for {RUST_GLIB_ADVISORY_ID}"
        ]
    return []


def glib_legacy_exception_owners_are_allowed(
    package_dependencies: dict[str, list[str]],
    legacy_glib_ancestors: set[str],
    glib_exception_owned_packages: set[str],
    legacy_glib_direct_owners: set[str],
) -> bool:
    """Return whether every glib ancestor matches the documented GTK/WebKit stack."""
    if not legacy_glib_ancestors:
        return False
    ancestor_names = {
        ancestor.rsplit(" ", maxsplit=1)[0] for ancestor in legacy_glib_ancestors
    }
    direct_owner_names = {
        owner.rsplit(" ", maxsplit=1)[0] for owner in legacy_glib_direct_owners
    }
    if not direct_owner_names <= RUST_GLIB_LEGACY_DIRECT_OWNER_NAMES:
        return False
    off_chain_ancestors = legacy_glib_ancestors - glib_exception_owned_packages
    allowed_app_roots = {
        ancestor
        for ancestor in off_chain_ancestors
        if ancestor.rsplit(" ", maxsplit=1)[0]
        in RUST_GLIB_LEGACY_ALLOWED_APP_ROOT_NAMES
    }
    if off_chain_ancestors != allowed_app_roots:
        return False
    if not glib_allowed_app_roots_reach_glib_through_tauri(
        package_dependencies, allowed_app_roots
    ):
        return False
    return ancestor_names <= (
        RUST_GLIB_LEGACY_ALLOWED_ANCESTOR_NAMES
        | RUST_GLIB_LEGACY_ALLOWED_APP_ROOT_NAMES
    )


def glib_allowed_app_roots_reach_glib_through_tauri(
    package_dependencies: dict[str, list[str]], allowed_app_roots: set[str]
) -> bool:
    """Return whether app roots reach legacy glib only through Tauri."""
    for app_root in allowed_app_roots:
        glib_reaching_dependencies = {
            dependency
            for dependency in package_dependencies.get(app_root, [])
            if RUST_GLIB_LEGACY_EXCEPTION_PACKAGE
            in cargo_lock_reachable_package_keys(package_dependencies, dependency)
        }
        glib_reaching_dependency_names = {
            dependency.rsplit(" ", maxsplit=1)[0]
            for dependency in glib_reaching_dependencies
        }
        if glib_reaching_dependency_names != {RUST_GLIB_LEGACY_ROOT_NAME}:
            return False
        if not cargo_lock_has_named_dependency_path(
            package_dependencies, app_root, RUST_GLIB_LEGACY_EXPECTED_CHAIN_NAMES
        ):
            return False
    return True


def cargo_lock_has_named_dependency_path(
    package_dependencies: dict[str, list[str]],
    root_package: str,
    package_names: tuple[str, ...],
) -> bool:
    """Return whether a dependency path contains package names in order."""
    pending: list[tuple[str, int, frozenset[str]]] = [(root_package, 0, frozenset())]
    while pending:
        current, matched_count, seen = pending.pop()
        if current in seen:
            continue
        current_name = current.rsplit(" ", maxsplit=1)[0]
        next_matched_count = matched_count
        if (
            matched_count < len(package_names)
            and current_name == package_names[matched_count]
        ):
            next_matched_count += 1
            if next_matched_count == len(package_names):
                return True
        next_seen = seen | {current}
        for dependency in package_dependencies.get(current, []):
            pending.append((dependency, next_matched_count, next_seen))
    return False


def unsupported_numeric_semver_violation(
    lockfile: Path, package_name: str, version: str, advisory_id: str
) -> str | None:
    """Return a violation for non-numeric or overly long Cargo version forms."""
    segments = version.split(".")
    if any(not segment.isdecimal() for segment in segments):
        return (
            f"{lockfile}: {package_name} {version} has a non-numeric version segment "
            f"for {advisory_id}"
        )
    if len(segments) > 3:
        return (
            f"{lockfile}: {package_name} {version} has a non-standard extra version segment "
            f"for {advisory_id}"
        )
    return None


def parse_numeric_semver(version: str) -> tuple[int, int, int] | None:
    """Return a three-part numeric semver tuple for supported Cargo versions."""
    segments = version.split(".")
    if any(not segment.isdecimal() for segment in segments):
        return None
    if len(segments) > 3:
        return None
    parsed_parts = [int(part) for part in segments]
    while len(parsed_parts) < 3:
        parsed_parts.append(0)
    return parsed_parts[0], parsed_parts[1], parsed_parts[2]


def cargo_lock_package_dependencies(lockfile: Path) -> dict[str, list[str]]:
    """Return Cargo package keys and dependency tokens from a lockfile."""
    packages: dict[str, list[str]] = {}
    for package in cargo_lock_packages(lockfile):
        current_name = str(package.get("name", ""))
        current_version = str(package.get("version", ""))
        if not current_name or not current_version:
            continue
        dependencies = package.get("dependencies", [])
        if not isinstance(dependencies, list):
            dependencies = []
        packages[f"{current_name} {current_version}"] = [
            str(dependency).strip() for dependency in dependencies
        ]
    return cargo_lock_normalized_package_dependencies(packages)


def cargo_lock_packages(lockfile: Path) -> list[dict[str, object]]:
    """Return Cargo package tables from supported lockfile TOML forms."""
    packages: list[dict[str, object]] = []
    current_package: dict[str, object] | None = None
    in_dependencies = False
    dependency_tokens: list[str] = []

    def store_current_package() -> None:
        if current_package is not None:
            if in_dependencies:
                current_package["dependencies"] = dependency_tokens.copy()
            packages.append(current_package.copy())

    for line in [*lockfile.read_text(encoding="utf-8").splitlines(), "[[package]]"]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "[[package]]":
            store_current_package()
            current_package = {}
            in_dependencies = False
            dependency_tokens = []
            continue
        if current_package is None:
            continue
        if in_dependencies:
            if stripped == "]":
                current_package["dependencies"] = dependency_tokens.copy()
                in_dependencies = False
                continue
            if stripped.startswith('"'):
                dependency_tokens.append(stripped.strip('",'))
            continue
        key, separator, value = stripped.partition("=")
        if not separator:
            continue
        normalized_key = key.strip()
        normalized_value = value.strip()
        if normalized_key == "dependencies":
            if normalized_value == "[":
                in_dependencies = True
                dependency_tokens = []
                continue
            current_package["dependencies"] = parse_cargo_lock_string_list(
                normalized_value
            )
            continue
        if normalized_key in {"name", "version"}:
            current_package[normalized_key] = parse_cargo_lock_scalar(normalized_value)
    return packages


def parse_cargo_lock_string_list(value: str) -> list[str]:
    """Return strings from an inline Cargo.lock dependency array."""
    parsed_value = ast.literal_eval(value)
    if not isinstance(parsed_value, list):
        return []
    return [str(item).strip() for item in parsed_value]


def parse_cargo_lock_scalar(value: str) -> str:
    """Return a scalar Cargo.lock TOML value as text."""
    parsed_value = ast.literal_eval(value)
    return str(parsed_value)


def cargo_lock_normalized_package_dependencies(
    package_dependencies: dict[str, list[str]],
) -> dict[str, list[str]]:
    """Return dependency tokens normalized to exact package keys when possible."""
    package_keys_by_name: dict[str, list[str]] = {}
    for package_key in package_dependencies:
        package_name = package_key.rsplit(" ", maxsplit=1)[0]
        package_keys_by_name.setdefault(package_name, []).append(package_key)

    normalized: dict[str, list[str]] = {}
    for package_key, dependency_tokens in package_dependencies.items():
        normalized_tokens: list[str] = []
        for dependency_token in dependency_tokens:
            dependency = dependency_token.strip()
            if dependency in package_dependencies:
                normalized_tokens.append(dependency)
                continue
            matching_package_keys = package_keys_by_name.get(dependency, [])
            if len(matching_package_keys) == 1:
                normalized_tokens.append(matching_package_keys[0])
                continue
            normalized_tokens.append(dependency)
        normalized[package_key] = normalized_tokens
    return normalized


def cargo_lock_dependency_owners(
    package_dependencies: dict[str, list[str]], dependency: str
) -> set[str]:
    """Return package keys that directly reference the target dependency key."""
    return {
        owner
        for owner, dependency_tokens in package_dependencies.items()
        if dependency in dependency_tokens
    }


def cargo_lock_dependency_ancestors(
    package_dependencies: dict[str, list[str]], dependency: str
) -> set[str]:
    """Return every package key that can reach the target dependency key."""
    reverse_dependencies: dict[str, set[str]] = {}
    for package_key, dependency_tokens in package_dependencies.items():
        for dependency_token in dependency_tokens:
            reverse_dependencies.setdefault(dependency_token, set()).add(package_key)

    ancestors: set[str] = set()
    pending = list(reverse_dependencies.get(dependency, set()))
    while pending:
        current = pending.pop()
        if current in ancestors:
            continue
        ancestors.add(current)
        pending.extend(reverse_dependencies.get(current, set()))
    return ancestors


def cargo_lock_reachable_package_keys(
    package_dependencies: dict[str, list[str]], root_package: str
) -> set[str]:
    """Return package keys reachable from a root package dependency graph."""
    reachable: set[str] = set()
    pending = [root_package]
    while pending:
        current = pending.pop()
        if current in reachable:
            continue
        reachable.add(current)
        pending.extend(package_dependencies.get(current, []))
    return reachable


def cargo_lock_reachable_package_keys_by_name(
    package_dependencies: dict[str, list[str]], root_package_name: str
) -> set[str]:
    """Return packages reachable from every package whose key has the root name."""
    reachable: set[str] = set()
    for package_key in package_dependencies:
        package_name = package_key.rsplit(" ", maxsplit=1)[0]
        if package_name == root_package_name:
            reachable.update(
                cargo_lock_reachable_package_keys(package_dependencies, package_key)
            )
    return reachable


def cargo_lock_has_dependency_chain(
    package_dependencies: dict[str, list[str]], package_chain: tuple[str, ...]
) -> bool:
    """Return whether Cargo dependencies contain the exact package chain."""
    return all(
        cargo_dependency_targets_package(package_dependencies, owner, dependency)
        for owner, dependency in pairwise(package_chain)
    )


def cargo_dependency_targets_package(
    package_dependencies: dict[str, list[str]], owner: str, dependency: str
) -> bool:
    """Return whether an owner package depends on the target package key."""
    dependency_tokens = package_dependencies.get(owner, [])
    return dependency in dependency_tokens


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
    violations.extend(rust_dependency_advisory_violations())

    if violations:
        print("Supply-chain verification failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Supply-chain verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
