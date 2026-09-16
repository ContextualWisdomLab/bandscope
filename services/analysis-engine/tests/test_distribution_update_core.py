"""Native contract gates for BandScope Distribution/update Rust boundaries."""

from __future__ import annotations

import subprocess
from pathlib import Path
from types import MappingProxyType

import yaml

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MANIFESTS = (
    _REPO_ROOT / "apps" / "desktop" / "distribution-core" / "Cargo.toml",
    _REPO_ROOT / "apps" / "desktop" / "distribution-state" / "Cargo.toml",
    _REPO_ROOT / "apps" / "desktop" / "distribution-runtime" / "Cargo.toml",
    _REPO_ROOT / "apps" / "desktop" / "distribution-download" / "Cargo.toml",
    _REPO_ROOT / "apps" / "desktop" / "distribution-transport" / "Cargo.toml",
)
_CI_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "ci.yml"
_EXPECTED_STAGING_PLATFORMS = frozenset({"ubuntu-latest", "windows-2025", "macos-15"})


def test_distribution_update_native_suites_are_green() -> None:
    """Run locked decision, state, metadata, download, and transport Rust contracts."""
    for manifest in _MANIFESTS:
        completed = subprocess.run(
            [
                "cargo",
                "test",
                "--manifest-path",
                str(manifest),
                "--locked",
                "--all-targets",
            ],
            cwd=_REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
            timeout=60,
        )

        assert completed.returncode == 0, (
            f"{manifest.relative_to(_REPO_ROOT)} failed:\n"
            + completed.stdout
            + completed.stderr
        )


def test_staging_lease_contract_runs_on_all_shipped_desktop_os_families() -> None:
    """Require platform CI for filesystem-lock semantics before the main CI gate can pass."""
    workflow = yaml.safe_load(_CI_WORKFLOW.read_text(encoding="utf-8"))
    jobs = MappingProxyType(workflow["jobs"])
    platform_job = jobs["distribution-download-platform"]

    assert platform_job["needs"] == "lock-validation"
    assert set(platform_job["strategy"]["matrix"]["os"]) == _EXPECTED_STAGING_PLATFORMS
    assert platform_job["runs-on"] == "${{ matrix.os }}"

    commands = "\n".join(
        str(step.get("run", "")) for step in platform_job["steps"] if isinstance(step, dict)
    )
    assert (
        "cargo +stable test --manifest-path "
        "apps/desktop/distribution-download/Cargo.toml --locked --all-targets"
    ) in commands

    verify_needs = jobs["verify"]["needs"]
    assert "lock-validation" in verify_needs
    assert "distribution-download-platform" in verify_needs
