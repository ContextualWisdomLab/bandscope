"""Contracts for the coordinated PDF.js and Undici security baseline."""

from __future__ import annotations

import json
from pathlib import Path


_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_PDFJS_VERSION = "6.2.108"
_UNDICI_VERSION = "7.29.0"
_PDFJS_INTEGRITY = (
    "sha512-YxFb+SQcodN2rnX9Tn3dHYlqfb7NjlzzfONPpJd+AKoKtUjEdevTfbC07d5Tcczz"
    "OK6261auRkP/M8OBHs9vFQ=="
)
_UNDICI_INTEGRITY = (
    "sha512-IDxfleLmmbSskfWSUATiN1nfn2rDuvnMOqb5CWR92iIfojA0Ud+ulOAAEQ57LPr9"
    "rWmsreUyf5lwyao+7GNNVw=="
)


def _read_json(relative_path: str) -> dict[str, object]:
    """Return one repository JSON document as a mapping."""
    document = json.loads(
        (_REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")
    )
    assert isinstance(document, dict)
    return document


def test_manifests_pin_the_security_floors_without_semver_drift() -> None:
    """Keep the vulnerable transitive client and PDF parser on exact versions."""
    root_manifest = _read_json("package.json")
    desktop_manifest = _read_json("apps/desktop/package.json")

    assert root_manifest["overrides"]["undici"] == _UNDICI_VERSION  # type: ignore[index]
    assert desktop_manifest["dependencies"]["pdfjs-dist"] == _PDFJS_VERSION  # type: ignore[index]


def test_lock_records_match_exact_registry_artifacts_and_preserve_peer_metadata() -> None:
    """Require the pinned generator's exact graph without unrelated esbuild churn."""
    lock_document = _read_json("package-lock.json")
    packages = lock_document["packages"]
    assert isinstance(packages, dict)

    desktop = packages["apps/desktop"]
    assert isinstance(desktop, dict)
    assert desktop["dependencies"]["pdfjs-dist"] == _PDFJS_VERSION  # type: ignore[index]

    pdfjs = packages["node_modules/pdfjs-dist"]
    assert pdfjs == {
        "version": _PDFJS_VERSION,
        "resolved": (
            "https://registry.npmjs.org/pdfjs-dist/-/"
            f"pdfjs-dist-{_PDFJS_VERSION}.tgz"
        ),
        "integrity": _PDFJS_INTEGRITY,
        "license": "Apache-2.0",
        "engines": {"node": ">=22.13.0 || >=24"},
    }

    undici = packages["node_modules/undici"]
    assert isinstance(undici, dict)
    assert undici["version"] == _UNDICI_VERSION
    assert undici["resolved"] == (
        "https://registry.npmjs.org/undici/-/undici-7.29.0.tgz"
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
