"""Regression tests for Distribution HTTP dependency admission."""

from __future__ import annotations

from pathlib import Path

from conftest import load_module

POLICY = load_module(
    "scripts/checks/verify_distribution_http_dependencies.py",
    "verify_distribution_http_dependencies",
)


def _write_fixture(
    root: Path,
    *,
    reqwest: str | None,
    rustls_version: str | None,
) -> None:
    """Write the smallest standalone Distribution transport dependency graph."""
    crate = root / "apps/desktop/distribution-transport"
    crate.mkdir(parents=True)
    dependency = reqwest or ""
    (crate / "Cargo.toml").write_text(
        '[package]\nname = "fixture"\nversion = "0.0.0"\n\n'
        "[dependencies]\n"
        f"{dependency}",
        encoding="utf-8",
    )
    packages = []
    if reqwest is not None:
        packages.append(
            '[[package]]\nname = "reqwest"\nversion = "0.13.5"\n'
            'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
            'checksum = "fixture"\n'
        )
    if rustls_version is not None:
        packages.append(
            f'[[package]]\nname = "rustls"\nversion = "{rustls_version}"\n'
            'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
            'checksum = "fixture"\n'
        )
    (crate / "Cargo.lock").write_text(
        "version = 4\n\n" + "\n".join(packages),
        encoding="utf-8",
    )


def test_direct_reqwest_rejects_rustls_advisory_range(tmp_path: Path) -> None:
    """Reject the affected rustls 0.23.13 through 0.23.44 range."""
    _write_fixture(
        tmp_path,
        reqwest=(
            'reqwest = { version = "0.13.5", default-features = false, '
            'features = ["rustls"] }\n'
        ),
        rustls_version="0.23.44",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("RUSTSEC-2026-0285" in violation for violation in violations)
    assert any("rustls >=0.23.45" in violation for violation in violations)


def test_direct_reqwest_accepts_patched_rustls(tmp_path: Path) -> None:
    """Accept the first patched rustls 0.23 release."""
    _write_fixture(
        tmp_path,
        reqwest=(
            'reqwest = { version = "0.13.5", default-features = false, '
            'features = ["rustls"] }\n'
        ),
        rustls_version="0.23.45",
    )

    assert POLICY.verify_distribution_http_dependency_admission(tmp_path) == []


def test_direct_reqwest_accepts_later_unaffected_rustls_line(tmp_path: Path) -> None:
    """Do not freeze the gate to the 0.23 minor line."""
    _write_fixture(
        tmp_path,
        reqwest=(
            'reqwest = { version = "0.13.5", default-features = false, '
            'features = ["rustls"] }\n'
        ),
        rustls_version="0.24.0",
    )

    assert POLICY.verify_distribution_http_dependency_admission(tmp_path) == []


def test_unrelated_transitive_rustls_does_not_activate_distribution_gate(
    tmp_path: Path,
) -> None:
    """Scope the gate to the Distribution transport crate's direct HTTP client."""
    _write_fixture(tmp_path, reqwest=None, rustls_version="0.23.44")

    assert POLICY.verify_distribution_http_dependency_admission(tmp_path) == []


def test_direct_reqwest_requires_explicit_tls_feature_ownership(tmp_path: Path) -> None:
    """Reject reqwest's implicit default TLS/backend feature selection."""
    _write_fixture(
        tmp_path,
        reqwest='reqwest = { version = "0.13.5" }\n',
        rustls_version="0.23.45",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("default features must be disabled" in violation for violation in violations)
    assert any("explicitly enable the rustls feature" in violation for violation in violations)


def test_direct_reqwest_rejects_vendored_native_tls_without_alpn(tmp_path: Path) -> None:
    """Reject the final reqwest native-TLS feature spelling, not just its siblings."""
    _write_fixture(
        tmp_path,
        reqwest=(
            'reqwest = { version = "0.13.5", default-features = false, '
            'features = ["rustls", "native-tls-vendored-no-alpn"] }\n'
        ),
        rustls_version="0.23.45",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any(
        "native-tls-vendored-no-alpn" in violation for violation in violations
    )


def test_direct_reqwest_rejects_unapproved_transport_features(tmp_path: Path) -> None:
    """Keep updater transport semantics explicit instead of activating optional behavior."""
    unapproved_features = (
        "gzip",
        "brotli",
        "zstd",
        "deflate",
        "system-proxy",
        "socks",
        "hickory-dns",
        "http2",
        "http3",
    )
    for feature in unapproved_features:
        fixture = tmp_path / feature
        _write_fixture(
            fixture,
            reqwest=(
                'reqwest = { version = "0.13.5", default-features = false, '
                f'features = ["rustls", "{feature}"] }}\n'
            ),
            rustls_version="0.23.45",
        )

        violations = POLICY.verify_distribution_http_dependency_admission(fixture)

        assert any(feature in violation for violation in violations), feature


def test_target_specific_reqwest_cannot_bypass_direct_dependency_admission(
    tmp_path: Path,
) -> None:
    """Treat target-scoped runtime reqwest declarations as direct owner dependencies."""
    _write_fixture(tmp_path, reqwest=None, rustls_version="0.23.45")
    manifest = (
        tmp_path / "apps/desktop/distribution-transport/Cargo.toml"
    )
    manifest.write_text(
        manifest.read_text(encoding="utf-8")
        + '\n[target.\'cfg(windows)\'.dependencies]\n'
        + 'reqwest = { version = "0.13.5", default-features = false, '
        + 'features = ["rustls", "gzip"] }\n',
        encoding="utf-8",
    )
    lock = tmp_path / "apps/desktop/distribution-transport/Cargo.lock"
    lock.write_text(
        lock.read_text(encoding="utf-8")
        + '\n[[package]]\nname = "reqwest"\nversion = "0.13.5"\n'
        + 'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
        + 'checksum = "fixture"\n',
        encoding="utf-8",
    )

    violations = POLICY.verify_distribution_http_dependency_admission(tmp_path)

    assert any("gzip" in violation for violation in violations)
    assert any("cfg(windows)" in violation for violation in violations)
