"""Tests for repository supply-chain and workflow coverage checks."""

from __future__ import annotations

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


@pytest.mark.parametrize(
    "npx_command",
    [
        "npx -y @tauri-apps/cli build --target x86_64-pc-windows-msvc",
        "npx -y `@tauri-apps/cli` build --target x86_64-pc-windows-msvc",
        "npx --package @tauri-apps/cli tauri build --target x86_64-pc-windows-msvc",
        "npx --package=@tauri-apps/cli tauri build --target x86_64-pc-windows-msvc",
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
