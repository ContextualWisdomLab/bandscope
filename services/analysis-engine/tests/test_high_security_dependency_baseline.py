"""Contracts for the coordinated PDF.js, jsdom, and Undici security baseline."""

from __future__ import annotations

import json
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_PDFJS_VERSION = "6.2.108"
_JSDOM_VERSION = "30.0.1"
_UNDICI_VERSION = "8.10.0"
_PDFJS_INTEGRITY = (
    "sha512-YxFb+SQcodN2rnX9Tn3dHYlqfb7NjlzzfONPpJd+AKoKtUjEdevTfbC07d5Tcczz"
    "OK6261auRkP/M8OBHs9vFQ=="
)
_UNDICI_INTEGRITY = (
    "sha512-HvltHd7avK13QIw/oLe4qoOLyoVSoafqJ2jYOrtMRBkbYT31eiBQ8O0ehRKZiEZCMEy"
    "LFQNIADpgCWC5fALvYQ=="
)
_JSDOM_INTEGRITY = (
    "sha512-52v7mUVUfNQVYYqE1lcdaymWL0njO7lTLUog6ZvW2U5KsbiLk/GnZlVJ+qx0xfNJZ6Gn"
    "+KSpPNE52vurbxZwrA=="
)


def _read_json(relative_path: str) -> dict[str, object]:
    """Return one repository JSON document as a mapping."""
    document = json.loads((_REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    return document


def test_manifests_pin_the_security_floors_without_semver_drift() -> None:
    """Keep the HTTP test stack and PDF parser on compatible exact versions."""
    root_manifest = _read_json("package.json")
    desktop_manifest = _read_json("apps/desktop/package.json")

    assert root_manifest["devDependencies"]["jsdom"] == _JSDOM_VERSION  # type: ignore[index]
    assert root_manifest["devDependencies"]["undici"] == _UNDICI_VERSION  # type: ignore[index]
    assert root_manifest["overrides"]["undici"] == "$undici"  # type: ignore[index]
    assert desktop_manifest["dependencies"]["pdfjs-dist"] == _PDFJS_VERSION  # type: ignore[index]
    assert desktop_manifest["devDependencies"]["jsdom"] == _JSDOM_VERSION  # type: ignore[index]


def test_lock_records_match_exact_registry_artifacts_and_preserve_peer_metadata() -> None:
    """Require the pinned generator's exact graph without unrelated esbuild churn."""
    lock_document = _read_json("package-lock.json")
    packages = lock_document["packages"]
    assert isinstance(packages, dict)

    root_package = packages[""]
    assert isinstance(root_package, dict)
    assert root_package["devDependencies"]["jsdom"] == _JSDOM_VERSION  # type: ignore[index]
    assert root_package["devDependencies"]["undici"] == _UNDICI_VERSION  # type: ignore[index]

    desktop = packages["apps/desktop"]
    assert isinstance(desktop, dict)
    assert desktop["dependencies"]["pdfjs-dist"] == _PDFJS_VERSION  # type: ignore[index]
    assert desktop["devDependencies"]["jsdom"] == _JSDOM_VERSION  # type: ignore[index]

    pdfjs = packages["node_modules/pdfjs-dist"]
    assert isinstance(pdfjs, dict)
    assert pdfjs["version"] == _PDFJS_VERSION
    assert pdfjs["resolved"] == (
        f"https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-{_PDFJS_VERSION}.tgz"
    )
    assert pdfjs["integrity"] == _PDFJS_INTEGRITY
    assert pdfjs["license"] == "Apache-2.0"
    assert pdfjs["engines"] == {"node": ">=22.13.0 || >=24"}

    jsdom = packages["node_modules/jsdom"]
    assert isinstance(jsdom, dict)
    assert jsdom["version"] == _JSDOM_VERSION
    assert jsdom["resolved"] == (
        f"https://registry.npmjs.org/jsdom/-/jsdom-{_JSDOM_VERSION}.tgz"
    )
    assert jsdom["integrity"] == _JSDOM_INTEGRITY
    assert jsdom["dependencies"]["undici"] == "^8.9.0"  # type: ignore[index]

    undici = packages["node_modules/undici"]
    assert isinstance(undici, dict)
    assert undici["version"] == _UNDICI_VERSION
    assert undici["resolved"] == (
        f"https://registry.npmjs.org/undici/-/undici-{_UNDICI_VERSION}.tgz"
    )
    assert undici["integrity"] == _UNDICI_INTEGRITY

    esbuild_locations = {
        path: metadata
        for path, metadata in packages.items()
        if isinstance(path, str) and path.startswith("node_modules/@esbuild/")
    }
    assert esbuild_locations
    assert all(
        isinstance(metadata, dict) and metadata.get("peer") is True
        for metadata in esbuild_locations.values()
    )
