"""Contracts for the PDF.js, Nanoid, and Undici security floors."""

from __future__ import annotations

import json
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_PDFJS_VERSION = "6.2.108"
_NANOID_VERSION = "3.3.18"
_UNDICI_VERSION = "7.29.0"


def _read_json(relative_path: str) -> dict[str, object]:
    """Return one repository JSON document as a mapping."""
    document = json.loads((_REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    return document


def _package_record(packages: dict[str, object], suffix: str) -> dict[str, object]:
    """Return the lockfile record whose path ends with the requested package name."""
    matches = [
        metadata
        for path, metadata in packages.items()
        if path == f"node_modules/{suffix}" or path.endswith(f"/node_modules/{suffix}")
    ]
    assert len(matches) == 1
    record = matches[0]
    assert isinstance(record, dict)
    return record


def test_manifests_pin_the_security_floors_without_semver_drift() -> None:
    """Keep the PDF parser and vulnerable transitives on exact patched versions."""
    root_manifest = _read_json("package.json")
    desktop_manifest = _read_json("apps/desktop/package.json")
    overrides = root_manifest["overrides"]
    assert isinstance(overrides, dict)
    root_dev_dependencies = root_manifest["devDependencies"]
    assert isinstance(root_dev_dependencies, dict)
    dependencies = desktop_manifest["dependencies"]
    assert isinstance(dependencies, dict)

    assert overrides["nanoid"] == _NANOID_VERSION
    assert overrides["undici"] == "$undici"
    assert root_dev_dependencies["undici"] == _UNDICI_VERSION
    assert dependencies["pdfjs-dist"] == _PDFJS_VERSION


def test_lock_records_match_the_patched_registry_artifacts() -> None:
    """Require the lockfile to install the patched HIGH-severity JavaScript floors."""
    lock_document = _read_json("package-lock.json")
    packages = lock_document["packages"]
    assert isinstance(packages, dict)

    desktop = packages["apps/desktop"]
    assert isinstance(desktop, dict)
    desktop_dependencies = desktop["dependencies"]
    assert isinstance(desktop_dependencies, dict)
    assert desktop_dependencies["pdfjs-dist"] == _PDFJS_VERSION

    pdfjs = _package_record(packages, "pdfjs-dist")
    assert pdfjs["version"] == _PDFJS_VERSION
    assert pdfjs["resolved"] == (
        f"https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-{_PDFJS_VERSION}.tgz"
    )

    nanoid = _package_record(packages, "nanoid")
    assert nanoid["version"] == _NANOID_VERSION
    assert nanoid["resolved"] == (
        f"https://registry.npmjs.org/nanoid/-/nanoid-{_NANOID_VERSION}.tgz"
    )

    undici = _package_record(packages, "undici")
    assert undici["version"] == _UNDICI_VERSION
    assert undici["resolved"] == (
        f"https://registry.npmjs.org/undici/-/undici-{_UNDICI_VERSION}.tgz"
    )
