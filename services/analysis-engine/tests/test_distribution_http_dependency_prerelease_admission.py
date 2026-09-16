"""Pre-release boundary contracts for Distribution's security-owned HTTP graph."""

from __future__ import annotations

from pathlib import Path

import pytest

from conftest import load_module

POLICY = load_module(
    "scripts/checks/verify_distribution_http_dependencies.py",
    "verify_distribution_http_dependencies_prerelease_admission",
)


def _write_fixture(
    root: Path,
    *,
    locked_reqwest_version: str = "0.13.5",
    locked_rustls_version: str = "0.23.45",
) -> None:
    """Write one crates.io-backed Distribution HTTP graph for version-bound tests."""
    crate = root / "apps/desktop/distribution-transport"
    crate.mkdir(parents=True)
    (crate / "Cargo.toml").write_text(
        '[package]\nname = "fixture"\nversion = "0.0.0"\n\n'
        "[dependencies]\n"
        'reqwest = { version = "0.13.5", default-features = false, '
        'features = ["rustls"] }\n',
        encoding="utf-8",
    )
    (crate / "Cargo.lock").write_text(
        "version = 4\n\n"
        f'[[package]]\nname = "reqwest"\nversion = "{locked_reqwest_version}"\n'
        'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
        'checksum = "fixture"\n\n'
        f'[[package]]\nname = "rustls"\nversion = "{locked_rustls_version}"\n'
        'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
        'checksum = "fixture"\n',
        encoding="utf-8",
    )


def test_reqwest_prerelease_lock_is_not_treated_as_reviewed_stable_line(tmp_path: Path) -> None:
    """A pre-release package must not inherit the owner review for stable 0.13.5+."""
    _write_fixture(tmp_path, locked_reqwest_version="0.13.5-alpha.1")

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("reviewed stable reqwest range" in violation for violation in violations)


@pytest.mark.parametrize("rustls_version", ["0.23.45-alpha.1", "0.23.45-rc.1"])
def test_rustls_prerelease_before_patched_stable_is_still_advisory_affected(
    tmp_path: Path,
    rustls_version: str,
) -> None:
    """RustSec's >=0.23.45 patch boundary excludes 0.23.45 pre-releases."""
    _write_fixture(tmp_path, locked_rustls_version=rustls_version)

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any(POLICY.RUSTLS_ENCRYPTION_LEVEL_ADVISORY in violation for violation in violations)


def test_rustls_stable_patched_boundary_remains_admitted(tmp_path: Path) -> None:
    """Keep the exact first stable patched release admitted."""
    _write_fixture(tmp_path, locked_rustls_version="0.23.45")

    assert POLICY.verify_distribution_http_dependency_admission(tmp_path) == []
