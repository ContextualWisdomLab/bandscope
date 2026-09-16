"""Regression tests for Distribution reqwest feature-forwarding admission."""

from __future__ import annotations

from pathlib import Path

from conftest import load_module

POLICY = load_module(
    "scripts/checks/verify_distribution_http_dependencies.py",
    "verify_distribution_http_dependencies_feature_forwarding",
)

CRATES_IO_SOURCE = "registry+https://github.com/rust-lang/crates.io-index"


def _write_fixture(root: Path, *, dependency_name: str, package_field: str, feature: str) -> None:
    """Write an otherwise-admitted reqwest graph with one forwarded dependency feature."""
    crate = root / "apps/desktop/distribution-transport"
    crate.mkdir(parents=True)
    (crate / "Cargo.toml").write_text(
        '[package]\nname = "fixture"\nversion = "0.0.0"\n\n'
        '[dependencies]\n'
        f'{dependency_name} = {{ {package_field}version = "0.13.5", '
        'default-features = false, features = ["rustls"] }}\n\n'
        '[features]\n'
        f'default = ["{dependency_name}/{feature}"]\n',
        encoding="utf-8",
    )
    (crate / "Cargo.lock").write_text(
        "version = 4\n\n"
        '[[package]]\nname = "reqwest"\nversion = "0.13.5"\n'
        f'source = "{CRATES_IO_SOURCE}"\n\n'
        '[[package]]\nname = "rustls"\nversion = "0.23.45"\n'
        f'source = "{CRATES_IO_SOURCE}"\n',
        encoding="utf-8",
    )


def test_root_feature_cannot_add_unapproved_reqwest_feature(tmp_path: Path) -> None:
    """Reject Cargo feature forwarding that re-enables gzip outside the dependency table."""
    _write_fixture(
        tmp_path,
        dependency_name="reqwest",
        package_field="",
        feature="gzip",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any(
        "reqwest/gzip" in violation and "feature" in violation
        for violation in violations
    )


def test_renamed_reqwest_feature_forwarding_is_also_rejected(tmp_path: Path) -> None:
    """Apply the same invariant when Cargo renames the reqwest dependency key."""
    _write_fixture(
        tmp_path,
        dependency_name="distribution_http",
        package_field='package = "reqwest", ',
        feature="brotli",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any(
        "distribution_http/brotli" in violation and "feature" in violation
        for violation in violations
    )
