#!/usr/bin/env python3
"""Fail closed when BandScope release-version or model admission projections disagree.

Security Notes:
- ``repository_root`` is an already-selected repository boundary. Version identity
  reads only the fixed ``VERSION``, ``package.json``, and Tauri configuration.
- The CLI composes the sibling Distribution model-policy guard. Normal branch/PR
  checks validate that policy; version-tag checks additionally require exact
  commercially admitted model bytes before any platform build can start.
- VERSION and JSON fields are validated as exact, non-empty, trimmed strings
  before comparison; malformed text or JSON fails closed without echoing values.
- These guards have no network, filesystem-write, update, credential, signing,
  or publication authority. They only return verified release inputs or failure.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

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


def _load_model_policy_module() -> ModuleType:
    """Load the adjacent Distribution model-policy guard without another package owner."""
    guard_path = Path(__file__).with_name("verify_release_model_policy.py")
    guard_spec = importlib.util.spec_from_file_location(
        "bandscope_verify_release_model_policy", guard_path
    )
    if guard_spec is None or guard_spec.loader is None:
        raise ValueError("could not load release model policy guard")
    guard_module = importlib.util.module_from_spec(guard_spec)
    try:
        guard_spec.loader.exec_module(guard_module)
    except (ImportError, OSError, SyntaxError) as load_error:
        raise ValueError("could not load release model policy guard") from load_error
    return guard_module


def _model_policy_verifier() -> Callable[..., dict[str, Any]]:
    """Return the sibling policy verifier and reject an incomplete guard module."""
    guard_module = _load_model_policy_module()
    verifier = getattr(guard_module, "verify_model_policy", None)
    if not callable(verifier):
        raise ValueError("release model policy guard lacks verify_model_policy")
    return verifier


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
    """Run version and model-admission gates for repository and tag workflows."""
    release_tag = (
        os.environ.get("GITHUB_REF_NAME")
        if os.environ.get("GITHUB_REF_TYPE") == "tag"
        else None
    )
    try:
        release_version = verify_release_identity(
            _REPOSITORY_ROOT, release_tag=release_tag
        )
        verify_model_policy = _model_policy_verifier()
        verify_model_policy(
            _REPOSITORY_ROOT,
            require_admitted=release_tag is not None,
        )
    except ValueError as identity_error:
        print(f"release preflight check failed: {identity_error}", file=sys.stderr)
        return 1
    print(f"BandScope release preflight verified: v{release_version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
