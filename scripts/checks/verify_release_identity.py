#!/usr/bin/env python3
"""Fail closed when BandScope release identity or release admission projections disagree.

Security Notes:
- ``repository_root`` is an already-selected repository boundary. Version identity
  reads only the fixed ``VERSION``, ``package.json``, and Tauri configuration.
- VERSION and JSON projections are read twice from the same bounded regular
  non-link file descriptor; both byte snapshots plus descriptor identity/size
  must remain stable, and JSON duplicate members and non-standard numeric
  constants are rejected before any version value is compared.
- The CLI composes the sibling Distribution model-policy and updater-policy guards.
  Normal branch/PR checks validate both policies; version-tag checks additionally
  require exact commercially admitted model and updater release authority before
  any platform build can start.
- VERSION and JSON fields are validated as exact, non-empty, trimmed strings
  before comparison; malformed text or JSON fails closed without echoing values.
- Stable release versions use the same canonical numeric MAJOR.MINOR.PATCH grammar
  and unsigned-64-bit component range as the native Distribution/update policy
  core. Prerelease/build forms, leading zeros, and numeric overflow therefore
  cannot enter packaging and later become updater metadata the runtime rejects.
- These guards have no network, filesystem-write, update, credential, signing,
  or publication authority. They only return verified release inputs or failure.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import stat
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_STABLE_VERSION_RE = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$"
)
_U64_MAX_DECIMAL = "18446744073709551615"
_MAX_VERSION_BYTES = 128
_MAX_RELEASE_METADATA_BYTES = 256 * 1024


def _is_u64_decimal(component: str) -> bool:
    """Return whether one canonical decimal component fits Rust ``u64``."""
    if len(component) < len(_U64_MAX_DECIMAL):
        return True
    if len(component) > len(_U64_MAX_DECIMAL):
        return False
    return component <= _U64_MAX_DECIMAL


def _is_canonical_stable_version(value: str) -> bool:
    """Match the native ``StableVersion`` grammar and numeric range exactly."""
    match = _STABLE_VERSION_RE.fullmatch(value)
    return match is not None and all(
        _is_u64_decimal(component) for component in match.groups()
    )


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a JSON object while rejecting parser-dependent duplicate members."""
    document: dict[str, Any] = {}
    for key, value in pairs:
        if key in document:
            raise ValueError(f"duplicate JSON member in release metadata: {key}")
        document[key] = value
    return document


def _reject_nonstandard_json_constant(value: str) -> None:
    """Reject Python's non-standard NaN/Infinity JSON extensions."""
    raise json.JSONDecodeError("non-standard JSON constant", value, 0)


def _read_bounded_regular_text(
    path: Path, *, maximum_bytes: int, label: str
) -> str:
    """Read one bounded regular non-link file from one stable descriptor."""
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as read_error:
        raise ValueError(f"{label} must be a regular non-link file") from read_error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{label} must be a regular non-link file")
        try:
            path_identity = os.lstat(path)
        except OSError as identity_error:
            raise ValueError(f"{label} changed while being opened") from identity_error
        if (
            stat.S_ISLNK(path_identity.st_mode)
            or not stat.S_ISREG(path_identity.st_mode)
            or (path_identity.st_dev, path_identity.st_ino)
            != (before.st_dev, before.st_ino)
        ):
            raise ValueError(f"{label} must be a regular non-link file")
        if before.st_size < 1 or before.st_size > maximum_bytes:
            raise ValueError(f"{label} exceeds its bounded size policy")

        def read_snapshot() -> bytes:
            chunks: list[bytes] = []
            remaining = maximum_bytes + 1
            while remaining > 0:
                chunk = os.read(descriptor, min(64 * 1024, remaining))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            payload = b"".join(chunks)
            if len(payload) > maximum_bytes:
                raise ValueError(f"{label} exceeds its bounded size policy")
            return payload

        payload = read_snapshot()
        after_first = os.fstat(descriptor)
        if (
            (before.st_dev, before.st_ino, before.st_size)
            != (after_first.st_dev, after_first.st_ino, after_first.st_size)
            or len(payload) != before.st_size
        ):
            raise ValueError(f"{label} changed while being read")

        try:
            os.lseek(descriptor, 0, os.SEEK_SET)
        except OSError as seek_error:
            raise ValueError(f"{label} changed while being read") from seek_error
        verification_payload = read_snapshot()
        after_second = os.fstat(descriptor)
        if (
            (before.st_dev, before.st_ino, before.st_size)
            != (after_second.st_dev, after_second.st_ino, after_second.st_size)
            or len(verification_payload) != before.st_size
            or verification_payload != payload
        ):
            raise ValueError(f"{label} changed while being read")
        try:
            return payload.decode("utf-8")
        except UnicodeError as decode_error:
            raise ValueError(f"{label} is not valid UTF-8") from decode_error
    finally:
        os.close(descriptor)


def _read_json_object(metadata_path: Path) -> dict[str, Any]:
    """Read one bounded release metadata document and require a JSON object root."""
    raw_text = _read_bounded_regular_text(
        metadata_path,
        maximum_bytes=_MAX_RELEASE_METADATA_BYTES,
        label=metadata_path.name,
    )
    try:
        metadata_document = json.loads(
            raw_text,
            object_pairs_hook=_reject_duplicate_pairs,
            parse_constant=_reject_nonstandard_json_constant,
        )
    except json.JSONDecodeError as metadata_error:
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


def _load_policy_module(filename: str, module_name: str, label: str) -> ModuleType:
    """Load one adjacent Distribution policy guard without creating another owner."""
    guard_path = Path(__file__).with_name(filename)
    guard_spec = importlib.util.spec_from_file_location(module_name, guard_path)
    if guard_spec is None or guard_spec.loader is None:
        raise ValueError(f"could not load {label}")
    guard_module = importlib.util.module_from_spec(guard_spec)
    try:
        guard_spec.loader.exec_module(guard_module)
    except (ImportError, OSError, SyntaxError) as load_error:
        raise ValueError(f"could not load {label}") from load_error
    return guard_module


def _model_policy_verifier() -> Callable[..., dict[str, Any]]:
    """Return the sibling model-policy verifier and reject an incomplete module."""
    guard_module = _load_policy_module(
        "verify_release_model_policy.py",
        "bandscope_verify_release_model_policy",
        "release model policy guard",
    )
    verifier = getattr(guard_module, "verify_model_policy", None)
    if not callable(verifier):
        raise ValueError("release model policy guard lacks verify_model_policy")
    return verifier


def _updater_policy_verifier() -> Callable[..., dict[str, Any]]:
    """Return the sibling updater-policy verifier and reject an incomplete module."""
    guard_module = _load_policy_module(
        "verify_release_updater_policy.py",
        "bandscope_verify_release_updater_policy",
        "release updater policy guard",
    )
    verifier = getattr(guard_module, "verify_updater_policy", None)
    if not callable(verifier):
        raise ValueError("release updater policy guard lacks verify_updater_policy")
    return verifier


def verify_release_identity(
    repository_root: Path, release_tag: str | None = None
) -> str:
    """Verify package, Tauri, and optional tag versions against ``VERSION``."""
    version_text = _read_bounded_regular_text(
        repository_root / "VERSION",
        maximum_bytes=_MAX_VERSION_BYTES,
        label="VERSION",
    )

    version_lines = version_text.splitlines()
    if (
        len(version_lines) != 1
        or not version_lines[0]
        or version_lines[0] != version_lines[0].strip()
        or version_text != f"{version_lines[0]}\n"
    ):
        raise ValueError("VERSION must contain exactly one non-empty version line")
    release_version = version_lines[0]
    if not _is_canonical_stable_version(release_version):
        raise ValueError("VERSION must be canonical stable MAJOR.MINOR.PATCH")

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
    """Run version, model-admission, and updater-admission release gates."""
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
        verify_updater_policy = _updater_policy_verifier()
        verify_updater_policy(
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
