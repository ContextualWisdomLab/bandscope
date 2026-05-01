"""Tests for repository supply-chain and workflow coverage checks."""

from __future__ import annotations

import importlib
import re
from pathlib import Path

import pytest
from conftest import load_module


def test_supply_chain_check_requires_multi_arch_runner_labels(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure missing multi-arch workflow tokens are reported as violations."""
    supply_chain = load_module("scripts/checks/verify_supply_chain.py", "verify_supply_chain")

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build-windows:
    runs-on: windows-latest
  build-macos:
    runs-on: macos-latest
""".strip(),
        encoding="utf-8",
    )
    for path in supply_chain.REQUIRED_FILES:
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_text("placeholder", encoding="utf-8")
    (tmp_path / ".github" / "dependabot.yml").write_text(
        "\n".join(
            [
                'package-ecosystem: "npm"',
                'package-ecosystem: "pip"',
                'package-ecosystem: "cargo"',
                'package-ecosystem: "github-actions"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert "build workflow missing token: windows-11-arm" in violations
    assert "build workflow missing token: macos-15-intel" in violations
    assert "build workflow missing token: bandscope-windows-arm64-${{ github.sha }}" in violations
    assert "build workflow missing token: bandscope-macos-amd64-${{ github.sha }}" in violations
    assert "build workflow missing token: Get-MpComputerStatus" in violations


def test_supply_chain_check_accepts_repo_multi_arch_workflow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure the checked-in multi-arch workflow satisfies the baseline policy."""
    supply_chain = load_module("scripts/checks/verify_supply_chain.py", "verify_supply_chain_repo")
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    violations = supply_chain.verify_workflow_coverage()

    assert not any("build workflow missing token" in violation for violation in violations)
    assert (
        "build workflow should not rely on windows-latest for architecture coverage"
        not in violations
    )
    assert (
        "build workflow should not rely on macos-latest for architecture coverage" not in violations
    )


def test_build_baseline_upload_artifact_pins_are_consistent() -> None:
    """Ensure all upload-artifact steps use the same reviewed SHA pin."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "build-baseline.yml").read_text(
        encoding="utf-8"
    )
    pins = re.findall(r"actions/upload-artifact@([A-Fa-f0-9]{40})", workflow)

    assert pins
    assert len(set(pins)) == 1


def test_python_security_audit_does_not_ignore_patched_pygments_advisory() -> None:
    """Ensure patched Python advisories are not left as stale audit ignores."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "security-audit.yml").read_text(
        encoding="utf-8"
    )
    dependency_policy = (repo_root / "docs" / "security" / "dependency-policy.md").read_text(
        encoding="utf-8"
    )
    python_lockfile = (repo_root / "services" / "analysis-engine" / "uv.lock").read_text(
        encoding="utf-8"
    )

    assert "--ignore-vuln GHSA-5239-wwwm-4pmq" not in workflow
    assert "uv run --project services/analysis-engine --with pip-audit==2.8.0" in workflow
    assert "pip-audit --local --strict" in workflow
    assert "Pygments <2.20.0" in dependency_policy
    assert "pip-audit --local --strict" in dependency_policy
    tomllib = importlib.import_module("tomllib")
    lock = tomllib.loads(python_lockfile)
    packages = lock.get("package", [])
    pygments = [package for package in packages if package.get("name") == "pygments"]

    assert len(pygments) == 1
    assert pygments[0].get("version") == "2.20.0"
    assert all(package.get("version") != "2.19.2" for package in pygments)


def test_supply_chain_check_requires_ossf_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure OSSF Scorecard is not invoked on non-default release branches."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_guard"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
      - main
  schedule:
    - cron: '30 1 * * 1'
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard workflow must guard Scorecard execution to the repository default branch"
        in violations
    )


def test_supply_chain_check_requires_ossf_guard_without_main_branch_token(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard guard validation cannot be bypassed by omitting main."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_guard_no_main"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
  schedule:
    - cron: '30 1 * * 1'
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard workflow must guard Scorecard execution to the repository default branch"
        in violations
    )


def test_supply_chain_check_rejects_hardcoded_ossf_publish_results_branch(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard publish settings follow the repository default branch."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_publish"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
      - main
  schedule:
    - cron: '30 1 * * 1'
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
        with:
          publish_results: ${{ github.ref == 'refs/heads/develop' }}
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard publish_results must use the repository default branch guard" in violations
    )


def test_supply_chain_check_rejects_ossf_publish_job_run_steps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard publishing jobs satisfy OSSF uses-only restrictions."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_uses_only"
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]
    default_branch_ref = "format('refs/heads/{0}', github.event.repository.default_branch)"
    scorecard_action = (
        "      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        "\n".join(
            [
                "name: ossf-scorecard",
                "on:",
                "  push:",
                "    branches:",
                "      - develop",
                "      - main",
                "  schedule:",
                "    - cron: '30 1 * * 1'",
                "jobs:",
                "  analysis:",
                "    name: ossf-scorecard",
                "    steps:",
                "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
                scorecard_action,
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
                "      - name: Skip OSSF Scorecard on non-default branch",
                f"        if: github.ref != {default_branch_ref}",
                '        run: echo "skip"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert any(
        "ossf scorecard publishing job must only contain uses steps; split run steps "
        "into a separate non-publishing job" in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_ossf_publish_run_steps_in_any_workflow(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure OSSF publishing restrictions follow Scorecard if it moves workflows."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_any_workflow"
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]
    default_branch_ref = "format('refs/heads/{0}', github.event.repository.default_branch)"
    scorecard_action = (
        "      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        "\n".join(
            [
                "name: ossf-scorecard",
                "on: push",
                "jobs:",
                "  analysis:",
                "    name: ossf-scorecard",
                "    steps:",
                "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
                scorecard_action,
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
            ]
        ),
        encoding="utf-8",
    )
    (workflow_dir / "scorecard-security-gate.yml").write_text(
        "\n".join(
            [
                "name: scorecard-security-gate",
                "on: push",
                "jobs:",
                "  moved-scorecard:",
                "    steps:",
                scorecard_action,
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
                "      - name: extra diagnostics",
                '        run: echo "this breaks OSSF publishing"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert any(
        violation.startswith(".github/workflows/scorecard-security-gate.yml:")
        and "ossf scorecard publishing job must only contain uses steps" in violation
        for violation in violations
    )


def test_supply_chain_check_accepts_repo_ossf_publish_restrictions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure checked-in OSSF Scorecard workflow follows publish restrictions."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    violations = supply_chain.verify_workflow_coverage()

    assert not any("ossf scorecard" in violation for violation in violations)


def test_supply_chain_check_rejects_vulnerable_rust_rand_lockfile(
    tmp_path: Path,
) -> None:
    """Ensure the Rust lockfile cannot regress to vulnerable rand ranges."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_rand_vulnerable"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "rand"
version = "0.8.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "placeholder"

[[package]]
name = "rand"
version = "0.9.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "newer-vulnerable-api-series"

[[package]]
name = "rand"
version = "0.10.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "latest-vulnerable-api-series"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (f"{lockfile}: rand 0.8.5 is below patched 0.8.6 for GHSA-cq8v-f236-94qc") in violations
    assert (f"{lockfile}: rand 0.9.2 is below patched 0.9.3 for GHSA-cq8v-f236-94qc") in violations
    assert (
        f"{lockfile}: rand 0.10.0 is below patched 0.10.1 for GHSA-cq8v-f236-94qc"
    ) in violations


def test_supply_chain_check_rejects_non_exception_rust_rand_0_7_lockfile(
    tmp_path: Path,
) -> None:
    """Ensure legacy rand 0.7.x entries cannot be reintroduced."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_rand_0_7"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
version = "0.7.4"
name = "rand"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "unexpected-legacy-series"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.7.4 is not allowed for GHSA-cq8v-f236-94qc; "
        "the former legacy owner-chain exception has been removed"
    ) in violations


def test_supply_chain_check_handles_version_first_and_inline_dependency_fixtures(
    tmp_path: Path,
) -> None:
    """Ensure valid Cargo.lock key order and inline dependencies stay guarded."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_rand_format_variants",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
version = "1.0.0"
name = "bad-owner"
dependencies = ["rand 0.7.3"]

[[package]]
version = "0.7.3"
name = "rand"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "version-first-inline-owner"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.7.3 is not allowed for GHSA-cq8v-f236-94qc; "
        "the former legacy owner-chain exception has been removed"
    ) in violations


def test_supply_chain_check_reports_missing_rust_lockfile(tmp_path: Path) -> None:
    """Ensure missing Cargo.lock is reported as a supply-chain violation."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_lock_missing"
    )
    lockfile = tmp_path / "missing" / "Cargo.lock"

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert f"Cargo.lock missing: {lockfile}" in violations


def test_supply_chain_check_rejects_unowned_legacy_rust_rand_exception(
    tmp_path: Path,
) -> None:
    """Ensure rand 0.7.3 is rejected after retiring the owner-chain exception."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_rand_unowned"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
version = "0.7.3"
name = "rand"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "wrong-owner"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.7.3 is not allowed for GHSA-cq8v-f236-94qc; "
        "the former legacy owner-chain exception has been removed"
    ) in violations


def test_supply_chain_check_rejects_inline_dependency_legacy_rust_rand_owner(
    tmp_path: Path,
) -> None:
    """Ensure inline dependency arrays cannot hide retired rand owners."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_rand_inline_owner",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "tauri-utils"
version = "2.8.3"
dependencies = ["kuchikiki 0.8.8-speedreader"]

[[package]]
name = "kuchikiki"
version = "0.8.8-speedreader"
dependencies = ["selectors 0.24.0"]

[[package]]
name = "selectors"
version = "0.24.0"
dependencies = ["phf_codegen 0.8.0"]

[[package]]
name = "phf_codegen"
version = "0.8.0"
dependencies = ["phf_generator 0.8.0"]

[[package]]
name = "phf_generator"
version = "0.8.0"
dependencies = ["rand 0.7.3"]

[[package]]
name = "bad-owner"
version = "1.0.0"
dependencies = ["rand 0.7.3"]

[[package]]
name = "rand"
version = "0.7.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "legacy-exception"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.7.3 is not allowed for GHSA-cq8v-f236-94qc; "
        "the former legacy owner-chain exception has been removed"
    ) in violations


def test_supply_chain_check_rejects_documented_legacy_rust_rand_owner_chain(
    tmp_path: Path,
) -> None:
    """Ensure the former rand 0.7.3 exception cannot be reintroduced."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_rand_retired_owner",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "tauri-utils"
version = "2.8.3"
dependencies = ["kuchikiki 0.8.8-speedreader"]

[[package]]
name = "kuchikiki"
version = "0.8.8-speedreader"
dependencies = ["selectors 0.24.0"]

[[package]]
name = "selectors"
version = "0.24.0"
dependencies = ["phf_codegen 0.8.0"]

[[package]]
name = "phf_codegen"
version = "0.8.0"
dependencies = ["phf_generator 0.8.0"]

[[package]]
name = "phf_generator"
version = "0.8.0"
dependencies = ["rand 0.7.3"]

[[package]]
name = "rand"
version = "0.7.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "retired-exception"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.7.3 is not allowed for GHSA-cq8v-f236-94qc; "
        "the former legacy owner-chain exception has been removed"
    ) in violations


def test_supply_chain_check_reports_non_numeric_rust_rand_versions(
    tmp_path: Path,
) -> None:
    """Ensure non-standard rand versions are reported instead of crashing."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_rand_non_numeric_version",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "rand"
version = "0.9.3-alpha.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "non-stable"

[[package]]
name = "rand"
version = "0.8.6.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "extra-numeric-segment"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.9.3-alpha.1 has a non-numeric version segment for GHSA-cq8v-f236-94qc"
    ) in violations
    assert (
        f"{lockfile}: rand 0.8.6.1 has a non-standard extra version segment for GHSA-cq8v-f236-94qc"
    ) in violations


def test_supply_chain_check_rejects_mixed_owner_legacy_rust_rand_exception(
    tmp_path: Path,
) -> None:
    """Ensure the retired legacy chain does not exempt rand owners."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_rand_mixed_owner"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "tauri-utils"
version = "2.8.3"
dependencies = [
 "kuchikiki 0.8.8-speedreader",
]

[[package]]
name = "kuchikiki"
version = "0.8.8-speedreader"
dependencies = [
 "selectors 0.24.0",
]

[[package]]
name = "selectors"
version = "0.24.0"
dependencies = [
 "phf_codegen 0.8.0",
]

[[package]]
name = "phf_codegen"
version = "0.8.0"
dependencies = [
 "phf_generator 0.8.0",
]

[[package]]
name = "phf_generator"
version = "0.8.0"
dependencies = [
 "rand 0.7.3",
]

[[package]]
name = "bad-owner"
version = "1.0.0"
dependencies = [
 "rand 0.7.3",
]

[[package]]
name = "rand"
version = "0.7.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "legacy-exception"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.7.3 is not allowed for GHSA-cq8v-f236-94qc; "
        "the former legacy owner-chain exception has been removed"
    ) in violations


def test_supply_chain_check_accepts_repo_rust_rand_patch() -> None:
    """Ensure the checked-in Rust lockfile keeps rand on the patched 0.8 line."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_rand_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    violations = supply_chain.rust_dependency_advisory_violations(
        repo_root / "apps" / "desktop" / "src-tauri" / "Cargo.lock"
    )

    assert not violations


def test_supply_chain_check_rejects_yanked_rust_fastrand_lockfile(
    tmp_path: Path,
) -> None:
    """Ensure the Rust lockfile cannot regress to yanked fastrand 2.4.0."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_fastrand_yanked"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "fastrand"
version = "2.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "placeholder"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert f"{lockfile}: fastrand 2.4.0 is yanked and must stay updated" in violations


def test_supply_chain_check_accepts_repo_rust_fastrand_update() -> None:
    """Ensure the checked-in Rust lockfile keeps fastrand off yanked 2.4.0."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_fastrand_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    violations = supply_chain.rust_dependency_advisory_violations(
        repo_root / "apps" / "desktop" / "src-tauri" / "Cargo.lock"
    )

    assert not violations


def test_supply_chain_check_rejects_tracked_rust_rand_legacy_exception() -> None:
    """Ensure the fixed legacy rand advisory no longer has an audit exception."""
    repo_root = Path(__file__).resolve().parents[3]
    audit_config = repo_root / "apps" / "desktop" / "src-tauri" / ".cargo" / "audit.toml"
    content = audit_config.read_text(encoding="utf-8")

    assert "RUSTSEC-2026-0097" not in content


def test_supply_chain_check_rejects_stale_rust_fxhash_exception() -> None:
    """Ensure removed fxhash advisories no longer keep stale audit exceptions."""
    repo_root = Path(__file__).resolve().parents[3]
    audit_config = repo_root / "apps" / "desktop" / "src-tauri" / ".cargo" / "audit.toml"
    lockfile = repo_root / "apps" / "desktop" / "src-tauri" / "Cargo.lock"
    audit_content = audit_config.read_text(encoding="utf-8")
    lock_content = lockfile.read_text(encoding="utf-8")

    assert 'name = "fxhash"' not in lock_content
    assert "RUSTSEC-2025-0057" not in audit_content


def test_supply_chain_check_rejects_unowned_legacy_rust_glib_exception(
    tmp_path: Path,
) -> None:
    """Ensure glib 0.18.5 is exempt only on the documented Tauri GTK stack."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_glib_unowned"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "bad-owner"
version = "1.0.0"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "wrong-owner"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_rejects_mixed_owner_legacy_rust_glib_exception(
    tmp_path: Path,
) -> None:
    """Ensure a valid Tauri GTK chain does not exempt unrelated glib owners."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_rust_glib_mixed_owner"
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "tauri"
version = "2.10.3"
dependencies = ["tauri-runtime-wry 2.10.1"]

[[package]]
name = "tauri-runtime-wry"
version = "2.10.1"
dependencies = ["wry 0.54.4"]

[[package]]
name = "wry"
version = "0.54.4"
dependencies = ["webkit2gtk 2.0.2"]

[[package]]
name = "webkit2gtk"
version = "2.0.2"
dependencies = ["gtk 0.18.2"]

[[package]]
name = "gtk"
version = "0.18.2"
dependencies = ["glib 0.18.5"]

[[package]]
name = "bad-owner"
version = "1.0.0"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "mixed-owner"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_rejects_shared_intermediate_rust_glib_owner(
    tmp_path: Path,
) -> None:
    """Ensure a non-Tauri root cannot hide behind a shared GTK owner."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_glib_shared_intermediate_owner",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "tauri"
version = "2.11.0"
dependencies = ["tauri-runtime-wry 2.11.0"]

[[package]]
name = "tauri-runtime-wry"
version = "2.11.0"
dependencies = ["wry 0.55.0"]

[[package]]
name = "wry"
version = "0.55.0"
dependencies = ["webkit2gtk 2.0.2"]

[[package]]
name = "webkit2gtk"
version = "2.0.2"
dependencies = ["gtk 0.18.2"]

[[package]]
name = "bad-root"
version = "1.0.0"
dependencies = ["gtk 0.18.2"]

[[package]]
name = "gtk"
version = "0.18.2"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "shared-intermediate"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_rejects_app_root_direct_rust_glib_path(
    tmp_path: Path,
) -> None:
    """Ensure the app root reaches legacy glib only through the Tauri chain."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_glib_app_root_direct_path",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "bandscope-desktop"
version = "0.1.0"
dependencies = ["tauri 2.11.0", "gtk 0.18.2"]

[[package]]
name = "tauri"
version = "2.11.0"
dependencies = ["tauri-runtime-wry 2.11.0"]

[[package]]
name = "tauri-runtime-wry"
version = "2.11.0"
dependencies = ["wry 0.55.0"]

[[package]]
name = "wry"
version = "0.55.0"
dependencies = ["webkit2gtk 2.0.2"]

[[package]]
name = "webkit2gtk"
version = "2.0.2"
dependencies = ["gtk 0.18.2"]

[[package]]
name = "gtk"
version = "0.18.2"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "app-root-direct-path"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_rejects_tauri_direct_rust_glib_owner(
    tmp_path: Path,
) -> None:
    """Ensure Tauri ancestry alone does not allow a direct glib shortcut."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_glib_tauri_direct_owner",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "bandscope-desktop"
version = "0.1.0"
dependencies = ["tauri 2.11.0"]

[[package]]
name = "tauri"
version = "2.11.0"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "tauri-direct-owner"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_rejects_short_tauri_rust_glib_path(
    tmp_path: Path,
) -> None:
    """Ensure Tauri-owned glib still needs a complete WebKit/GTK path."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_glib_short_tauri_path",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "bandscope-desktop"
version = "0.1.0"
dependencies = ["tauri 2.11.0"]

[[package]]
name = "tauri"
version = "2.11.0"
dependencies = ["gtk 0.18.2"]

[[package]]
name = "gtk"
version = "0.18.2"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "short-tauri-path"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_rejects_tauri_reachable_unexpected_rust_glib_owner(
    tmp_path: Path,
) -> None:
    """Ensure Tauri reachability alone does not broaden the glib exception."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_glib_tauri_bad_owner",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "tauri"
version = "2.11.0"
dependencies = ["bad-owner 1.0.0"]

[[package]]
name = "bad-owner"
version = "1.0.0"
dependencies = ["glib 0.18.5"]

[[package]]
name = "glib"
version = "0.18.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "tauri-reachable-wrong-owner"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.18.5 matches the legacy exception version but "
        "does not have the documented Tauri/wry/webkit2gtk/gtk owner chain "
        "for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_reports_non_numeric_rust_glib_versions(
    tmp_path: Path,
) -> None:
    """Ensure non-standard glib versions are reported instead of passing closed."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_rust_glib_non_numeric_version",
    )
    lockfile = tmp_path / "Cargo.lock"
    lockfile.write_text(
        """
[[package]]
name = "glib"
version = "0.19.3-alpha.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "non-stable"

[[package]]
name = "glib"
version = "0.18.5.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "extra-numeric-segment"
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: glib 0.19.3-alpha.1 has a non-numeric version segment for RUSTSEC-2024-0429"
    ) in violations
    assert (
        f"{lockfile}: glib 0.18.5.1 has a non-standard extra version segment for RUSTSEC-2024-0429"
    ) in violations


def test_supply_chain_check_requires_tracked_rust_glib_legacy_exception() -> None:
    """Ensure the remaining legacy glib advisory is narrowly documented."""
    repo_root = Path(__file__).resolve().parents[3]
    audit_config = repo_root / "apps" / "desktop" / "src-tauri" / ".cargo" / "audit.toml"
    content = audit_config.read_text(encoding="utf-8")

    assert (
        '"RUSTSEC-2024-0429", # glib 0.18.5: VariantStrIter unsoundness, '
        "transitive via Tauri/wry/webkit2gtk/gtk GTK3 stack; remove when upstream "
        "drops or patches the chain"
    ) in content


def test_dependency_policy_documents_rust_glib_legacy_exception() -> None:
    """Ensure the glib exception records owner-chain scope and removal criteria."""
    repo_root = Path(__file__).resolve().parents[3]
    dependency_policy = repo_root / "docs" / "security" / "dependency-policy.md"
    content = dependency_policy.read_text(encoding="utf-8")

    assert "`RUSTSEC-2024-0429` for `glib 0.18.5`" in content
    assert "VariantStrIter" in content
    assert "Tauri/wry/webkit2gtk/gtk GTK3 stack" in content
    assert "no compatible lockfile-only update" in content
    assert "drops or patches the chain" in content


def test_tauri_main_capability_uses_explicit_core_permissions() -> None:
    """Ensure Tauri core permissions stay narrow after dependency refreshes."""
    repo_root = Path(__file__).resolve().parents[3]
    capability = repo_root / "apps" / "desktop" / "src-tauri" / "capabilities" / "main.json"
    content = capability.read_text(encoding="utf-8")

    assert '"core:default"' not in content
    assert '"core:event:allow-emit"' not in content
    assert '"core:event:allow-emit-to"' not in content
    assert '"core:event:allow-listen"' in content
    assert '"core:event:allow-unlisten"' in content


def test_supply_chain_check_rejects_release_published_asset_upload(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure immutable releases are not mutated after publication."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_immutable_release_upload"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "sbom.yml").write_text(
        """
name: sbom
on:
  release:
    types:
      - published
jobs:
  release-sbom:
    steps:
      - name: Attach SBOM to GitHub Release
        run: gh release upload "$RELEASE_TAG" bandscope-sbom.cdx.json --clobber
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    assert hasattr(supply_chain, "verify_immutable_release_upload_policy")
    violations = supply_chain.verify_immutable_release_upload_policy()

    assert (
        ".github/workflows/sbom.yml: release published workflows must not upload GitHub "
        "Release assets; immutable releases require draft-before-publish asset attachment"
    ) in violations


def test_supply_chain_check_accepts_immutable_release_safe_workflows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure checked-in workflows avoid release-published asset mutation."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_immutable_release_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    assert hasattr(supply_chain, "verify_immutable_release_upload_policy")
    violations = supply_chain.verify_immutable_release_upload_policy()

    assert not violations


def test_supply_chain_check_rejects_release_artifact_wildcard_upload(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure draft-release creation cannot attach arbitrary files from artifacts/."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_release_allowlist"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  publish-immutable-release:
    steps:
      - name: Validate release asset set
        run: |
          windows_amd64=(artifacts/*windows-amd64*)
      - name: Create draft release with complete assets, then publish
        run: |
          gh release create "$RELEASE_TAG" \
            artifacts/* \
            bandscope-sbom.cdx.json \
            --draft
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    assert hasattr(supply_chain, "verify_release_asset_allowlist_policy")
    violations = supply_chain.verify_release_asset_allowlist_policy()

    assert (
        ".github/workflows/build-baseline.yml: release asset upload must use an explicit "
        "allowlist, not artifacts/*" in violations
    )


def test_supply_chain_check_rejects_release_asset_array_globs(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure release asset arrays cannot allow matching stray platform files."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_release_array_globs"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  publish-immutable-release:
    steps:
      - name: Create draft release with complete assets, then publish
        run: |
          release_assets=(
            artifacts/*windows-amd64*.exe
            artifacts/*windows-amd64*.sha256
            bandscope-sbom.cdx.json
          )
          gh release create "$RELEASE_TAG" \
            "${release_assets[@]}" \
            --draft
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_release_asset_allowlist_policy()

    assert (
        ".github/workflows/build-baseline.yml: release asset upload must use an explicit "
        "allowlist, not artifacts/*" in violations
    )


def test_supply_chain_check_accepts_repo_release_asset_allowlist_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure checked-in release publishing uses the strict asset allowlist."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_release_allowlist_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    violations = supply_chain.verify_release_asset_allowlist_policy()

    assert not violations


def test_supply_chain_check_rejects_bare_workflow_npx_package_fetch(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure workflow package execution cannot rely on bare npx package lookup."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_npx_policy"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        run: npx @tauri-apps/cli build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )
    (tmp_path / "package-lock.json").write_text(
        '{"packages":{"node_modules/@tauri-apps/cli":{"version":"2.10.1"}}}',
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    assert hasattr(supply_chain, "verify_workflow_npx_policy")
    violations = supply_chain.verify_workflow_npx_policy()

    assert any(
        "workflow npx package execution must use npm exec or npx --no-install: @tauri-apps/cli"
        in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_versioned_workflow_npx_package_fetch(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure npx package specs with explicit versions cannot bypass policy."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_versioned_npx"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        run: npx @tauri-apps/cli@2.10.1 build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_npx_policy()

    expected_violation = (
        "workflow npx package execution must use npm exec or npx --no-install: "
        "@tauri-apps/cli@2.10.1"
    )
    assert any(expected_violation in violation for violation in violations)


@pytest.mark.parametrize(
    "npx_command",
    [
        "npx -y @tauri-apps/cli build --target x86_64-pc-windows-msvc",
        "npx -y `@tauri-apps/cli` build --target x86_64-pc-windows-msvc",
        "npx '@tauri-apps/cli' build --target x86_64-pc-windows-msvc",
        'npx "@tauri-apps/cli" build --target x86_64-pc-windows-msvc',
        "npx --package @tauri-apps/cli tauri build --target x86_64-pc-windows-msvc",
        "npx --package=@tauri-apps/cli tauri build --target x86_64-pc-windows-msvc",
        "npx -p @tauri-apps/cli tauri build --target x86_64-pc-windows-msvc",
        "npx -p@tauri-apps/cli tauri build --target x86_64-pc-windows-msvc",
    ],
)
def test_supply_chain_check_rejects_workflow_npx_package_fetch_with_options(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, npx_command: str
) -> None:
    """Ensure npx package-fetch policy cannot be bypassed with npx options."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_npx_options_policy"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        f"""
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        run: {npx_command}
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_npx_policy()

    assert any(
        "workflow npx package execution must use npm exec or npx --no-install: @tauri-apps/cli"
        in violation
        for violation in violations
    )


def test_supply_chain_check_allows_workflow_npx_no_install_with_options(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure no-install npx calls remain allowed even with other options."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_npx_no_install"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        run: npx --no-install -y @tauri-apps/cli build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_npx_policy()

    assert not violations


def test_supply_chain_check_rejects_late_npx_no_install_after_package(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure --no-install only exempts calls when it is an npx option pre-package."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_late_no_install"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        run: npx @tauri-apps/cli --no-install build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_npx_policy()

    assert any(
        "workflow npx package execution must use npm exec or npx --no-install: @tauri-apps/cli"
        in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_multiline_workflow_npx_package_fetch(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure multiline run blocks cannot hide npx package fetches."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_multiline_npx"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        run: |
          npx \\
            @tauri-apps/cli build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_npx_policy()

    assert any(
        "workflow npx package execution must use npm exec or npx --no-install: @tauri-apps/cli"
        in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_release_create_explicit_asset_arguments(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure validated release creates cannot add hand-written asset paths."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_release_explicit_asset"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  publish-immutable-release:
    steps:
      - name: Validate release asset set
        run: python3 scripts/release/select_release_assets.py --output release-assets.txt
      - name: Create draft release with complete assets, then publish
        run: |
          mapfile -t release_assets < release-assets.txt
          gh release create "$RELEASE_TAG" \
            "${release_assets[@]}" \
            artifacts/debug.log \
            --draft
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_release_asset_allowlist_policy()

    assert (
        ".github/workflows/build-baseline.yml: release asset upload must use an explicit "
        "allowlist, not artifacts/*" in violations
    )


def test_supply_chain_check_rejects_workspace_exec_with_workflow_default_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure workflow defaults.run.working-directory cannot hide nested workspace exec."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_workflow_default_dir"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
defaults:
  run:
    working-directory: apps/desktop
jobs:
  build:
    steps:
      - name: Build native shell
        run: npm exec --workspace @bandscope/desktop -- tauri build
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_workspace_exec_policy()

    expected_violation = (
        ".github/workflows/build-baseline.yml: workflow npm exec --workspace commands must "
        "run from the repository root"
    )
    assert expected_violation in violations


def test_supply_chain_check_rejects_workspace_exec_with_job_default_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure job defaults.run.working-directory cannot hide nested workspace exec."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_job_default_dir"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    defaults:
      run:
        working-directory: apps/desktop
    steps:
      - name: Build native shell
        run: npm exec --workspace @bandscope/desktop -- tauri build
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_workspace_exec_policy()

    expected_violation = (
        ".github/workflows/build-baseline.yml: workflow npm exec --workspace commands must "
        "run from the repository root"
    )
    assert expected_violation in violations


def test_supply_chain_check_rejects_workspace_exec_from_nested_working_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure npm workspace commands execute from the repository root in workflows."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_workspace_exec"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        working-directory: apps/desktop
        run: npm exec --workspace @bandscope/desktop -- tauri build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    assert hasattr(supply_chain, "verify_workflow_workspace_exec_policy")
    violations = supply_chain.verify_workflow_workspace_exec_policy()

    expected_violation = (
        ".github/workflows/build-baseline.yml: workflow npm exec --workspace commands must "
        "run from the repository root"
    )
    assert expected_violation in violations


def test_supply_chain_check_rejects_multiline_workspace_exec_from_nested_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure multiline npm workspace commands cannot hide nested directories."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_multiline_workspace_exec",
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build:
    steps:
      - name: Build native shell
        working-directory: apps/desktop
        run: |
          npm exec \
            --workspace @bandscope/desktop -- tauri build --target x86_64-pc-windows-msvc
        """.strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_workspace_exec_policy()

    expected_violation = (
        ".github/workflows/build-baseline.yml: workflow npm exec --workspace commands must "
        "run from the repository root"
    )
    assert expected_violation in violations


def test_supply_chain_check_accepts_repo_workspace_exec_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure checked-in workflows run npm workspace execution from the root."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_workspace_exec_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    assert hasattr(supply_chain, "verify_workflow_workspace_exec_policy")
    violations = supply_chain.verify_workflow_workspace_exec_policy()

    assert not violations
