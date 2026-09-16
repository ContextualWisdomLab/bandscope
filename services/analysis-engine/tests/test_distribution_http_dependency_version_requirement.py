"""Version-requirement contracts for Distribution's production HTTP client."""

from __future__ import annotations

from pathlib import Path

import pytest

from conftest import load_module

POLICY = load_module(
    "scripts/checks/verify_distribution_http_dependencies.py",
    "verify_distribution_http_dependencies_version_requirement",
)


def _write_fixture(
    root: Path,
    version_requirement: str,
    *,
    locked_reqwest_version: str = "0.13.5",
) -> None:
    """Write a safe lock graph paired with one reqwest version requirement."""
    crate = root / "apps/desktop/distribution-transport"
    crate.mkdir(parents=True)
    (crate / "Cargo.toml").write_text(
        '[package]\nname = "fixture"\nversion = "0.0.0"\n\n'
        "[dependencies]\n"
        f'reqwest = {{ version = "{version_requirement}", default-features = false, '
        'features = ["rustls"] }}\n',
        encoding="utf-8",
    )
    (crate / "Cargo.lock").write_text(
        "version = 4\n\n"
        f'[[package]]\nname = "reqwest"\nversion = "{locked_reqwest_version}"\n'
        'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
        'checksum = "fixture"\n\n'
        '[[package]]\nname = "rustls"\nversion = "0.23.45"\n'
        'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
        'checksum = "fixture"\n',
        encoding="utf-8",
    )


@pytest.mark.parametrize("version_requirement", ["*", ">=0.13.5"])
def test_direct_reqwest_rejects_unbounded_version_requirement(
    tmp_path: Path,
    version_requirement: str,
) -> None:
    """Reject requirements that can drift across an unbounded future release line."""
    _write_fixture(tmp_path, version_requirement)

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("bounded three-component" in violation for violation in violations)


def test_direct_reqwest_accepts_bounded_three_component_requirement(tmp_path: Path) -> None:
    """Keep the normal Cargo caret requirement form available with a committed lock."""
    _write_fixture(tmp_path, "0.13.5")

    assert POLICY.verify_distribution_http_dependency_admission(tmp_path) == []


@pytest.mark.parametrize(
    ("version_requirement", "locked_reqwest_version"),
    [("0.13.4", "0.13.4"), ("0.14.0", "0.14.0")],
)
def test_direct_reqwest_rejects_unreviewed_release_lines(
    tmp_path: Path,
    version_requirement: str,
    locked_reqwest_version: str,
) -> None:
    """Require a new owner decision before downgrading or crossing reqwest's 0.13 line."""
    _write_fixture(
        tmp_path,
        version_requirement,
        locked_reqwest_version=locked_reqwest_version,
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("reviewed reqwest range" in violation for violation in violations)
