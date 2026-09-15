#!/usr/bin/env python3
"""Fail closed when Distribution HTTP dependency admission would select an unsafe TLS graph."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path

DISTRIBUTION_TRANSPORT_MANIFEST = Path("apps/desktop/distribution-transport/Cargo.toml")
DISTRIBUTION_TRANSPORT_LOCK = Path("apps/desktop/distribution-transport/Cargo.lock")
RUSTLS_ENCRYPTION_LEVEL_ADVISORY = "RUSTSEC-2026-0285"
RUSTLS_AFFECTED_MIN = (0, 23, 13)
RUSTLS_PATCHED_MIN = (0, 23, 45)
REQWEST_APPROVED_FEATURES = frozenset({"rustls"})


def _version_triplet(raw: str) -> tuple[int, int, int] | None:
    """Return the numeric core used by the advisory range."""
    core = raw.split("+", 1)[0].split("-", 1)[0]
    parts = core.split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        return None
    major, minor, patch = (int(part) for part in parts)
    return major, minor, patch


def _is_affected_rustls(raw: str) -> bool:
    """Return whether a rustls version is inside RUSTSEC-2026-0285's affected range."""
    version = _version_triplet(raw)
    return version is not None and RUSTLS_AFFECTED_MIN <= version < RUSTLS_PATCHED_MIN


def verify_distribution_http_dependency_admission(repo_root: Path) -> list[str]:
    """Verify direct reqwest admission before the production Distribution client compiles."""
    manifest_path = repo_root / DISTRIBUTION_TRANSPORT_MANIFEST
    lock_path = repo_root / DISTRIBUTION_TRANSPORT_LOCK
    manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
    reqwest = manifest.get("dependencies", {}).get("reqwest")
    if reqwest is None:
        return []

    violations: list[str] = []
    if not isinstance(reqwest, dict):
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_MANIFEST}: direct reqwest must use a table with "
            'default-features = false and features = ["rustls"]'
        )
    else:
        if reqwest.get("default-features") is not False:
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_MANIFEST}: reqwest default features must be "
                "disabled so TLS/backend features are never selected implicitly"
            )
        features = reqwest.get("features", [])
        if (
            not isinstance(features, list)
            or not all(isinstance(feature, str) for feature in features)
            or "rustls" not in features
        ):
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_MANIFEST}: reqwest must explicitly enable "
                "the rustls feature"
            )
        if isinstance(features, list) and all(
            isinstance(feature, str) for feature in features
        ):
            unapproved = sorted(set(features).difference(REQWEST_APPROVED_FEATURES))
            if unapproved:
                violations.append(
                    f"{DISTRIBUTION_TRANSPORT_MANIFEST}: reqwest must use only the "
                    "approved Distribution feature set (rustls); unapproved features: "
                    f"{', '.join(unapproved)}"
                )

    if not lock_path.exists():
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_LOCK}: direct reqwest requires a committed "
            "standalone lockfile"
        )
        return violations

    lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    packages = lock.get("package", [])
    reqwest_versions = [
        str(package.get("version", ""))
        for package in packages
        if package.get("name") == "reqwest"
    ]
    if not reqwest_versions:
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_LOCK}: direct reqwest is missing from the "
            "committed lock graph"
        )

    rustls_versions = [
        str(package.get("version", ""))
        for package in packages
        if package.get("name") == "rustls"
    ]
    if not rustls_versions:
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_LOCK}: reqwest rustls backend is selected but "
            "rustls is absent"
        )
        return violations

    for version in rustls_versions:
        if _version_triplet(version) is None:
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_LOCK}: cannot parse rustls version {version!r}"
            )
        elif _is_affected_rustls(version):
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_LOCK}: rustls {version} is affected by "
                f"{RUSTLS_ENCRYPTION_LEVEL_ADVISORY}; use rustls >=0.23.45 or an "
                "unaffected line"
            )
    return violations


def main() -> int:
    """Run the repository-root Distribution dependency admission gate."""
    repo_root = Path(__file__).resolve().parents[2]
    violations = verify_distribution_http_dependency_admission(repo_root)
    if violations:
        for violation in violations:
            print(f"ERROR: {violation}", file=sys.stderr)
        return 1
    print("Distribution HTTP dependency admission: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
