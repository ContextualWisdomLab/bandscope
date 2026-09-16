#!/usr/bin/env python3
"""Fail closed when Distribution HTTP dependency admission would select an unsafe TLS graph."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path
from typing import Any

DISTRIBUTION_TRANSPORT_MANIFEST = Path("apps/desktop/distribution-transport/Cargo.toml")
DISTRIBUTION_TRANSPORT_LOCK = Path("apps/desktop/distribution-transport/Cargo.lock")
RUSTLS_ENCRYPTION_LEVEL_ADVISORY = "RUSTSEC-2026-0285"
RUSTLS_AFFECTED_MIN = (0, 23, 13)
RUSTLS_PATCHED_MIN = (0, 23, 45)
REQWEST_REVIEWED_MIN = (0, 13, 5)
REQWEST_REVIEWED_UPPER = (0, 14, 0)
REQWEST_APPROVED_FEATURES = frozenset({"rustls"})
REQWEST_APPROVED_DECLARATION_KEYS = frozenset(
    {"version", "package", "default-features", "features"}
)
CRATES_IO_LOCK_SOURCE = "registry+https://github.com/rust-lang/crates.io-index"


def _parsed_version(raw: str) -> tuple[tuple[int, int, int], bool] | None:
    """Return numeric SemVer core plus whether a pre-release identifier is present."""
    without_build = raw.split("+", 1)[0]
    core, separator, _prerelease = without_build.partition("-")
    parts = core.split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        return None
    major, minor, patch = (int(part) for part in parts)
    return (major, minor, patch), bool(separator)


def _version_triplet(raw: str) -> tuple[int, int, int] | None:
    """Return the numeric core used by owner version and advisory ranges."""
    parsed = _parsed_version(raw)
    return None if parsed is None else parsed[0]


def _is_bounded_three_component_requirement(raw: str) -> bool:
    """Return whether a Cargo requirement is one canonical three-component caret form."""
    version = _version_triplet(raw)
    if version is None:
        return False
    canonical = ".".join(str(component) for component in version)
    return raw == canonical


def _is_reviewed_reqwest_version(raw: str) -> bool:
    """Return whether reqwest stays inside the reviewed stable 0.13 release line."""
    parsed = _parsed_version(raw)
    if parsed is None:
        return False
    version, has_prerelease = parsed
    return (
        not has_prerelease
        and REQWEST_REVIEWED_MIN <= version < REQWEST_REVIEWED_UPPER
    )


def _is_affected_rustls(raw: str) -> bool:
    """Return whether a rustls SemVer is inside RUSTSEC-2026-0285's affected range."""
    parsed = _parsed_version(raw)
    if parsed is None:
        return False
    version, has_prerelease = parsed
    at_or_after_affected_min = version > RUSTLS_AFFECTED_MIN or (
        version == RUSTLS_AFFECTED_MIN and not has_prerelease
    )
    before_patched_stable = version < RUSTLS_PATCHED_MIN or (
        version == RUSTLS_PATCHED_MIN and has_prerelease
    )
    return at_or_after_affected_min and before_patched_stable


def _dependency_package_name(dependency_name: str, declaration: Any) -> Any:
    """Return the Cargo package selected by one dependency key or rename."""
    if isinstance(declaration, dict) and "package" in declaration:
        return declaration["package"]
    return dependency_name


def _workspace_dependencies(manifest: dict[str, Any]) -> dict[str, Any]:
    """Return workspace dependency declarations visible to the root package."""
    workspace = manifest.get("workspace", {})
    if not isinstance(workspace, dict):
        return {}
    dependencies = workspace.get("dependencies", {})
    return dependencies if isinstance(dependencies, dict) else {}


def _resolved_package_name(
    dependency_name: str,
    declaration: Any,
    workspace_dependencies: dict[str, Any],
) -> Any:
    """Resolve package identity through Cargo workspace inheritance when present."""
    if isinstance(declaration, dict) and declaration.get("workspace") is True:
        inherited = workspace_dependencies.get(dependency_name)
        return _dependency_package_name(dependency_name, inherited)
    return _dependency_package_name(dependency_name, declaration)


def _reqwest_declarations_in_table(
    dependencies: Any,
    *,
    location_prefix: str,
    workspace_dependencies: dict[str, Any],
) -> list[tuple[str, Any]]:
    """Return reqwest package declarations from one normal dependency table."""
    if not isinstance(dependencies, dict):
        return []
    return [
        (f"{location_prefix}.{dependency_name}", declaration)
        for dependency_name, declaration in dependencies.items()
        if _resolved_package_name(
            dependency_name,
            declaration,
            workspace_dependencies,
        )
        == "reqwest"
    ]


def _direct_reqwest_declarations(manifest: dict[str, Any]) -> list[tuple[str, Any]]:
    """Return runtime reqwest packages from unconditional and target-scoped dependencies."""
    workspace_dependencies = _workspace_dependencies(manifest)
    declarations = _reqwest_declarations_in_table(
        manifest.get("dependencies", {}),
        location_prefix="dependencies",
        workspace_dependencies=workspace_dependencies,
    )

    targets = manifest.get("target", {})
    if isinstance(targets, dict):
        for selector, target_table in targets.items():
            if not isinstance(target_table, dict):
                continue
            declarations.extend(
                _reqwest_declarations_in_table(
                    target_table.get("dependencies", {}),
                    location_prefix=f"target.{selector}.dependencies",
                    workspace_dependencies=workspace_dependencies,
                )
            )
    return declarations


def _validate_reqwest_declaration(location: str, reqwest: Any) -> list[str]:
    """Validate one direct runtime reqwest declaration against owner policy."""
    prefix = f"{DISTRIBUTION_TRANSPORT_MANIFEST} [{location}]"
    violations: list[str] = []
    if not isinstance(reqwest, dict):
        return [
            f"{prefix}: direct reqwest must use a table with "
            'default-features = false and features = ["rustls"]'
        ]
    if reqwest.get("workspace") is True:
        return [
            f"{prefix}: reqwest workspace inheritance is not admitted for the "
            "Distribution transport; declare the package, default-features = false, "
            'and features = ["rustls"] directly in this runtime dependency table'
        ]

    unapproved_keys = sorted(
        set(reqwest).difference(REQWEST_APPROVED_DECLARATION_KEYS)
    )
    if unapproved_keys:
        violations.append(
            f"{prefix}: reqwest source must be the versioned crates.io package; "
            "git/path/alternate-registry and other declaration controls are not admitted; "
            f"unapproved keys: {', '.join(unapproved_keys)}"
        )
    version = reqwest.get("version")
    if not isinstance(version, str) or not version.strip():
        violations.append(
            f"{prefix}: reqwest source must include an explicit crates.io version requirement"
        )
    elif not _is_bounded_three_component_requirement(version):
        violations.append(
            f"{prefix}: reqwest version must use one bounded three-component Cargo "
            f"requirement such as 0.13.5; found {version!r}"
        )
    elif not _is_reviewed_reqwest_version(version):
        violations.append(
            f"{prefix}: reqwest {version} is outside the reviewed reqwest range "
            ">=0.13.5,<0.14.0; a downgrade or SemVer-line change requires a new "
            "Distribution owner decision and evidence"
        )

    if reqwest.get("default-features") is not False:
        violations.append(
            f"{prefix}: reqwest default features must be disabled so TLS/backend "
            "features are never selected implicitly"
        )
    features = reqwest.get("features", [])
    valid_feature_list = isinstance(features, list) and all(
        isinstance(feature, str) for feature in features
    )
    if not valid_feature_list or "rustls" not in features:
        violations.append(f"{prefix}: reqwest must explicitly enable the rustls feature")
    if valid_feature_list:
        unapproved = sorted(set(features).difference(REQWEST_APPROVED_FEATURES))
        if unapproved:
            violations.append(
                f"{prefix}: reqwest must use only the approved Distribution feature set "
                f"(rustls); unapproved features: {', '.join(unapproved)}"
            )
    return violations


def _validate_crates_io_lock_source(
    *,
    package_name: str,
    package: dict[str, Any],
) -> str | None:
    """Return a violation when a security-owned package is not crates.io-backed."""
    source = package.get("source")
    if source == CRATES_IO_LOCK_SOURCE:
        return None
    return (
        f"{DISTRIBUTION_TRANSPORT_LOCK}: {package_name} source must be canonical "
        f"crates.io registry; found {source!r}"
    )


def verify_distribution_http_dependency_admission(repo_root: Path) -> list[str]:
    """Verify direct reqwest admission before the production Distribution client compiles."""
    manifest_path = repo_root / DISTRIBUTION_TRANSPORT_MANIFEST
    lock_path = repo_root / DISTRIBUTION_TRANSPORT_LOCK
    manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
    declarations = _direct_reqwest_declarations(manifest)
    if not declarations:
        return []

    violations: list[str] = []
    for location, reqwest in declarations:
        violations.extend(_validate_reqwest_declaration(location, reqwest))

    if not lock_path.exists():
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_LOCK}: direct reqwest requires a committed "
            "standalone lockfile"
        )
        return violations

    lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    packages = lock.get("package", [])
    reqwest_packages = [
        package for package in packages if package.get("name") == "reqwest"
    ]
    if not reqwest_packages:
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_LOCK}: direct reqwest is missing from the "
            "committed lock graph"
        )
    for package in reqwest_packages:
        source_violation = _validate_crates_io_lock_source(
            package_name="reqwest",
            package=package,
        )
        if source_violation:
            violations.append(source_violation)
        version = str(package.get("version", ""))
        if _version_triplet(version) is None:
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_LOCK}: cannot parse reqwest version {version!r}"
            )
        elif not _is_reviewed_reqwest_version(version):
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_LOCK}: resolved reqwest {version} is outside "
                "the reviewed stable reqwest range >=0.13.5,<0.14.0; refresh only "
                "within the reviewed stable line or record a new Distribution owner decision"
            )

    rustls_packages = [
        package for package in packages if package.get("name") == "rustls"
    ]
    if not rustls_packages:
        violations.append(
            f"{DISTRIBUTION_TRANSPORT_LOCK}: reqwest rustls backend is selected but "
            "rustls is absent"
        )
        return violations

    for package in rustls_packages:
        source_violation = _validate_crates_io_lock_source(
            package_name="rustls",
            package=package,
        )
        if source_violation:
            violations.append(source_violation)
        version = str(package.get("version", ""))
        if _version_triplet(version) is None:
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_LOCK}: cannot parse rustls version {version!r}"
            )
        elif _is_affected_rustls(version):
            violations.append(
                f"{DISTRIBUTION_TRANSPORT_LOCK}: rustls {version} is affected by "
                f"{RUSTLS_ENCRYPTION_LEVEL_ADVISORY}; use the stable patched boundary "
                "rustls >=0.23.45 or another unaffected line"
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
