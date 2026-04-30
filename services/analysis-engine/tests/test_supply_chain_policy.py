"""Tests for repository supply-chain and workflow coverage checks."""

from __future__ import annotations

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
    """Ensure only the documented legacy rand 0.7.3 exception can pass."""
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
        "only rand 0.7.3 on the documented legacy owner chain is temporarily allowed"
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
        f"{lockfile}: rand 0.7.3 matches the legacy exception version but does not "
        "have the documented Tauri/kuchikiki owner chain for GHSA-cq8v-f236-94qc"
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
    """Ensure rand 0.7.3 is exempt only on the documented Tauri owner chain."""
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
        f"{lockfile}: rand 0.7.3 matches the legacy exception version but does not "
        "have the documented Tauri/kuchikiki owner chain for GHSA-cq8v-f236-94qc"
    ) in violations


def test_supply_chain_check_rejects_inline_dependency_legacy_rust_rand_owner(
    tmp_path: Path,
) -> None:
    """Ensure inline dependency arrays are included in legacy owner checks."""
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
        f"{lockfile}: rand 0.7.3 matches the legacy exception version but does not "
        "have the documented Tauri/kuchikiki owner chain for GHSA-cq8v-f236-94qc"
    ) in violations


def test_supply_chain_check_reports_non_numeric_rust_rand_versions(
    tmp_path: Path,
) -> None:
    """Ensure non-stable rand versions are reported instead of crashing."""
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
""".strip(),
        encoding="utf-8",
    )

    violations = supply_chain.rust_dependency_advisory_violations(lockfile)

    assert (
        f"{lockfile}: rand 0.9.3-alpha.1 has a non-numeric version segment for GHSA-cq8v-f236-94qc"
    ) in violations


def test_supply_chain_check_rejects_mixed_owner_legacy_rust_rand_exception(
    tmp_path: Path,
) -> None:
    """Ensure a valid legacy chain does not exempt unrelated rand owners."""
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
        f"{lockfile}: rand 0.7.3 matches the legacy exception version but does not "
        "have the documented Tauri/kuchikiki owner chain for GHSA-cq8v-f236-94qc"
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


def test_supply_chain_check_requires_tracked_rust_rand_legacy_exception() -> None:
    """Ensure the remaining legacy rand advisory is narrowly documented in audit config."""
    repo_root = Path(__file__).resolve().parents[3]
    audit_config = repo_root / "apps" / "desktop" / "src-tauri" / ".cargo" / "audit.toml"
    content = audit_config.read_text(encoding="utf-8")

    assert (
        '"RUSTSEC-2026-0097", # rand 0.7.3: transitive via Tauri/kuchikiki phf 0.8; '
        "remove when upstream drops the chain"
    ) in content


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
