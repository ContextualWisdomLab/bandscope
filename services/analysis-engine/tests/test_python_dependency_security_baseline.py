"""Regression contracts for BandScope's patched Python dependency baseline."""

from __future__ import annotations

import tomllib
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
PYPROJECT = REPO_ROOT / "services" / "analysis-engine" / "pyproject.toml"
UV_LOCK = REPO_ROOT / "services" / "analysis-engine" / "uv.lock"
DEPENDENCY_POLICY = REPO_ROOT / "docs" / "security" / "dependency-policy.md"
TRIVYIGNORE = REPO_ROOT / ".trivyignore"


def _locked_version(package_name: str) -> str:
    """Return the single locked version for ``package_name``."""
    lock = tomllib.loads(UV_LOCK.read_text(encoding="utf-8"))
    matches = [
        package.get("version")
        for package in lock.get("package", [])
        if package.get("name") == package_name
    ]
    assert len(matches) == 1
    version = matches[0]
    assert isinstance(version, str)
    return version


def _active_exceptions(policy: str) -> str:
    """Return the policy's controlled-exception section and fail on schema drift."""
    _prefix, start, remainder = policy.partition("Current controlled exceptions:")
    assert start
    active, end, _retired = remainder.partition(
        "Retired third-party deprecation and advisory signal:"
    )
    assert end
    return active


def test_python_security_baseline_keeps_patched_versions() -> None:
    """Prevent reintroduction of the patched setuptools, torch, and yt-dlp releases."""
    assert _locked_version("setuptools") == "84.0.0"
    assert _locked_version("torch") == "2.13.0"
    assert _locked_version("yt-dlp") == "2026.8.19"


def test_torch_security_policy_matches_supported_platform_contract() -> None:
    """Retire obsolete torch exceptions while preserving macOS Intel exclusion."""
    pyproject = PYPROJECT.read_text(encoding="utf-8")
    policy = DEPENDENCY_POLICY.read_text(encoding="utf-8")
    active_exceptions = _active_exceptions(policy)
    expected_demucs_requirement = (
        "\"demucs>=4.0.1 ; sys_platform != 'darwin' "
        "or platform_machine == 'arm64'\""
    )

    assert expected_demucs_requirement in pyproject
    assert "GHSA-53q9-r3pm-6pq6" not in active_exceptions
    assert "GHSA-rrmf-rvhw-rf47" not in active_exceptions
    assert "torch 2.2.2" not in active_exceptions
    assert ".github/workflows/dependency-review.yml" not in policy
    assert "services/analysis-engine/osv-scanner.toml" not in policy
    assert "macOS Intel" in policy
    assert "does not install Demucs or torch" in policy


def test_setuptools_security_exception_is_retired() -> None:
    """Reject the obsolete setuptools CVE exception after upgrading past its patch floor."""
    policy = DEPENDENCY_POLICY.read_text(encoding="utf-8")
    trivyignore = TRIVYIGNORE.read_text(encoding="utf-8")

    assert "GHSA-h35f-9h28-mq5c" not in _active_exceptions(policy)
    assert "CVE-2026-59890" not in trivyignore


def test_yt_dlp_policy_distinguishes_patch_floor_from_current_lock() -> None:
    """Keep the advisory's patched floor distinct from the intentionally newer lock."""
    pyproject = PYPROJECT.read_text(encoding="utf-8")
    policy = DEPENDENCY_POLICY.read_text(encoding="utf-8")

    assert '"yt-dlp>=2026.8.19"' in pyproject
    assert "GHSA-6v4j-43gg-vj32" in policy
    assert "fixed in 2026.7.4" in policy
    assert "2026.8.19" in policy
