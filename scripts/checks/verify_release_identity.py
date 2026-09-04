#!/usr/bin/env python3
"""Fail closed when BandScope release-version projections disagree.

Security Notes:
- ``repository_root`` is an already-selected repository boundary; this guard
  reads only the fixed ``VERSION``, ``package.json``, and Tauri configuration
  paths beneath it and never follows metadata-provided file paths.
- VERSION and JSON fields are validated as exact, non-empty, trimmed strings
  before comparison; malformed text or JSON fails closed without echoing values.
- The guard has no network, filesystem-write, subprocess, update, credential,
  signing, or publication authority. It only returns a version or a failure.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def _read_json_object(metadata_path: Path) -> dict[str, Any]:
    """Read one release metadata document and require a JSON object root."""
    try:
        metadata_document = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as metadata_error:
        raise ValueError(
            f"could not read release metadata: {metadata_path.name}"
        ) from metadata_error
    if not isinstance(metadata_document, dict):
        raise ValueError(f"release metadata must be an object: {metadata_path.name}")
    return metadata_document


def _required_string(
    metadata_document: dict[str, Any], field_name: str, source_name: str
) -> str:
    """Return a non-empty string field without coercing malformed metadata."""
    field_value = metadata_document.get(field_name)
    if (
        not isinstance(field_value, str)
        or not field_value.strip()
        or field_value != field_value.strip()
    ):
        raise ValueError(
            f"{source_name} {field_name} must be a non-empty trimmed string"
        )
    return field_value


def verify_release_identity(
    repository_root: Path, release_tag: str | None = None
) -> str:
    """Verify package, Tauri, and optional tag versions against ``VERSION``."""
    try:
        version_text = (repository_root / "VERSION").read_text(encoding="utf-8")
    except (OSError, UnicodeError) as identity_error:
        raise ValueError("could not read authoritative VERSION") from identity_error

    version_lines = version_text.splitlines()
    if (
        len(version_lines) != 1
        or not version_lines[0]
        or version_lines[0] != version_lines[0].strip()
        or version_text != f"{version_lines[0]}\n"
    ):
        raise ValueError("VERSION must contain exactly one non-empty version line")
    release_version = version_lines[0]

    package_document = _read_json_object(repository_root / "package.json")
    tauri_document = _read_json_object(
        repository_root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"
    )

    package_version = _required_string(
        package_document, "version", "package.json"
    )
    tauri_version = _required_string(
        tauri_document, "version", "tauri.conf.json"
    )
    if package_version != release_version:
        raise ValueError("package.json version does not match VERSION")
    if tauri_version != release_version:
        raise ValueError("tauri.conf.json version does not match VERSION")

    if release_tag is not None and release_tag != f"v{release_version}":
        raise ValueError("release tag does not match VERSION")

    return release_version


def main() -> int:
    """Run the release identity gate for repository and tag-triggered workflows."""
    release_tag = (
        os.environ.get("GITHUB_REF_NAME")
        if os.environ.get("GITHUB_REF_TYPE") == "tag"
        else None
    )
    try:
        release_version = verify_release_identity(
            _REPOSITORY_ROOT, release_tag=release_tag
        )
    except ValueError as identity_error:
        print(f"release identity check failed: {identity_error}", file=sys.stderr)
        return 1
    print(f"BandScope release identity verified: v{release_version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
