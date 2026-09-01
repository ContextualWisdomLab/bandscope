#!/usr/bin/env python3
"""Fail closed when BandScope release-version projections disagree."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def _read_json_object(path: Path) -> dict[str, Any]:
    """Read one release metadata document and require a JSON object root."""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"could not read release metadata: {path.name}") from error
    if not isinstance(document, dict):
        raise ValueError(f"release metadata must be an object: {path.name}")
    return document


def _required_string(document: dict[str, Any], key: str, source: str) -> str:
    """Return a non-empty string field without coercing malformed metadata."""
    value = document.get(key)
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ValueError(f"{source} {key} must be a non-empty trimmed string")
    return value


def verify_release_identity(root: Path, release_tag: str | None = None) -> str:
    """Verify package, Tauri, and optional tag versions against ``VERSION``."""
    try:
        version_text = (root / "VERSION").read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise ValueError("could not read authoritative VERSION") from error

    lines = version_text.splitlines()
    if (
        len(lines) != 1
        or not lines[0]
        or lines[0] != lines[0].strip()
        or version_text != f"{lines[0]}\n"
    ):
        raise ValueError("VERSION must contain exactly one non-empty version line")
    expected = lines[0]

    package = _read_json_object(root / "package.json")
    tauri = _read_json_object(root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json")

    package_version = _required_string(package, "version", "package.json")
    tauri_version = _required_string(tauri, "version", "tauri.conf.json")
    if package_version != expected:
        raise ValueError("package.json version does not match VERSION")
    if tauri_version != expected:
        raise ValueError("tauri.conf.json version does not match VERSION")

    if release_tag is not None and release_tag != f"v{expected}":
        raise ValueError("release tag does not match VERSION")

    return expected


def main() -> int:
    """Run the release identity gate for repository and tag-triggered workflows."""
    release_tag = (
        os.environ.get("GITHUB_REF_NAME")
        if os.environ.get("GITHUB_REF_TYPE") == "tag"
        else None
    )
    try:
        version = verify_release_identity(_REPOSITORY_ROOT, release_tag=release_tag)
    except ValueError as error:
        print(f"release identity check failed: {error}", file=sys.stderr)
        return 1
    print(f"BandScope release identity verified: v{version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
