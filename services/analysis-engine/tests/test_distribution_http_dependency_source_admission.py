"""Regression tests for Distribution HTTP dependency source admission."""

from __future__ import annotations

from pathlib import Path

from conftest import load_module

POLICY = load_module(
    "scripts/checks/verify_distribution_http_dependencies.py",
    "verify_distribution_http_dependencies_source",
)


def _write_source_fixture(
    root: Path,
    *,
    dependency_fields: str,
    reqwest_source: str | None,
) -> None:
    """Write one standalone reqwest graph with an explicit dependency source."""
    crate = root / "apps/desktop/distribution-transport"
    crate.mkdir(parents=True)
    (crate / "Cargo.toml").write_text(
        '[package]\nname = "fixture"\nversion = "0.0.0"\n\n'
        '[dependencies]\n'
        'reqwest = { default-features = false, features = ["rustls"], '
        f"{dependency_fields} }}\n",
        encoding="utf-8",
    )
    source_line = f'source = "{reqwest_source}"\n' if reqwest_source else ""
    (crate / "Cargo.lock").write_text(
        "version = 4\n\n"
        '[[package]]\nname = "reqwest"\nversion = "0.13.5"\n'
        f"{source_line}"
        '\n[[package]]\nname = "rustls"\nversion = "0.23.45"\n'
        'source = "registry+https://github.com/rust-lang/crates.io-index"\n',
        encoding="utf-8",
    )


def test_reqwest_noncanonical_sources_are_rejected(tmp_path: Path) -> None:
    """Reject git, path, and alternate-registry sources for the production client."""
    cases = (
        (
            "git",
            'git = "https://example.invalid/reqwest", rev = "deadbeef"',
            "git+https://example.invalid/reqwest?rev=deadbeef#deadbeef",
        ),
        ("path", 'path = "../reqwest-fork"', None),
        (
            "registry",
            'version = "0.13.5", registry = "private"',
            "registry+https://example.invalid/index",
        ),
    )
    for name, dependency_fields, reqwest_source in cases:
        fixture = tmp_path / name
        _write_source_fixture(
            fixture,
            dependency_fields=dependency_fields,
            reqwest_source=reqwest_source,
        )

        violations = POLICY.verify_distribution_http_dependency_admission(fixture)

        assert any("source" in violation for violation in violations), name


def test_rustls_noncanonical_lock_source_is_rejected(tmp_path: Path) -> None:
    """Reject a patched or forked rustls source hidden behind a safe-looking version."""
    _write_source_fixture(
        tmp_path,
        dependency_fields='version = "0.13.5"',
        reqwest_source="registry+https://github.com/rust-lang/crates.io-index",
    )
    lock = tmp_path / "apps/desktop/distribution-transport/Cargo.lock"
    lock.write_text(
        lock.read_text(encoding="utf-8").replace(
            'name = "rustls"\nversion = "0.23.45"\n'
            'source = "registry+https://github.com/rust-lang/crates.io-index"',
            'name = "rustls"\nversion = "0.23.45"\n'
            'source = "git+https://example.invalid/rustls#deadbeef"',
        ),
        encoding="utf-8",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("rustls source" in violation for violation in violations)


def test_transitive_noncanonical_lock_sources_are_rejected(tmp_path: Path) -> None:
    """Reject transitive git/path substitution behind canonical reqwest and rustls."""
    cases = (
        (
            "git-provider",
            "aws-lc-rs",
            'source = "git+https://example.invalid/aws-lc-rs#deadbeef"\n',
        ),
        ("path-webpki", "rustls-webpki", ""),
    )
    for fixture_name, package_name, source_line in cases:
        fixture = tmp_path / fixture_name
        _write_source_fixture(
            fixture,
            dependency_fields='version = "0.13.5"',
            reqwest_source="registry+https://github.com/rust-lang/crates.io-index",
        )
        lock = fixture / "apps/desktop/distribution-transport/Cargo.lock"
        lock.write_text(
            lock.read_text(encoding="utf-8")
            + f'\n[[package]]\nname = "{package_name}"\nversion = "1.0.0"\n'
            + source_line,
            encoding="utf-8",
        )

        violations = POLICY.verify_distribution_http_dependency_admission(fixture)

        assert any(
            package_name in violation and "source" in violation
            for violation in violations
        ), fixture_name
