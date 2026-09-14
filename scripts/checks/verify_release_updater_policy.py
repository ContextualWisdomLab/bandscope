#!/usr/bin/env python3
"""Verify BandScope's fail-closed commercial updater release policy.

Security Notes:
- updater authority is read only from fixed repository-relative policy and Tauri
  configuration paths; callers cannot supply alternate files or remote URLs;
- JSON inputs are bounded, duplicate-member rejecting, regular non-link files
  whose opened descriptor identity must remain stable while read;
- an admitted updater requires Tauri v2 updater artifacts, an exact embedded
  public verification key, and exact HTTPS endpoints with insecure transport
  disabled;
- a blocked policy must keep updater artifact generation/plugin configuration
  disabled, and a tag/release caller may require admission explicitly;
- this guard never reads private signing keys, downloads updates, signs bytes,
  installs software, or decides organization signing-key ownership.
"""

from __future__ import annotations

import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_POLICY_PATH = Path("release/updater-policy.json")
_TAURI_CONFIG_PATH = Path("apps/desktop/src-tauri/tauri.conf.json")
_MAX_POLICY_BYTES = 64 * 1024
_MAX_TAURI_CONFIG_BYTES = 256 * 1024
_MAX_PUBLIC_KEY_CHARACTERS = 16 * 1024
_MAX_ENDPOINTS = 4
_ALLOWED_POLICY_KEYS = frozenset(
    {
        "schemaVersion",
        "state",
        "channel",
        "minimumSupportedVersion",
        "publicKey",
        "endpoints",
        "reason",
    }
)
_ALLOWED_STATES = frozenset({"blocked", "admitted"})
_ALLOWED_CHANNELS = frozenset({"stable", "beta"})
_SEMVER_RE = re.compile(
    r"^(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)"
    r"(?:-((?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a JSON object while rejecting parser-dependent duplicate members."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON member: {key}")
        result[key] = value
    return result


def _stable_regular_file_bytes(path: Path, *, maximum_bytes: int, label: str) -> bytes:
    """Read one bounded regular non-link file from a stable opened descriptor."""
    if path.is_symlink():
        raise ValueError(f"{label} must not be a symlink")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as read_error:
        raise ValueError(f"could not open {label}") from read_error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{label} must be a regular file")
        if before.st_size < 1 or before.st_size > maximum_bytes:
            raise ValueError(f"{label} exceeds its bounded size policy")
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
        after = os.fstat(descriptor)
        before_identity = (before.st_dev, before.st_ino, before.st_size)
        after_identity = (after.st_dev, after.st_ino, after.st_size)
        if before_identity != after_identity or len(payload) != before.st_size:
            raise ValueError(f"{label} changed while being read")
        return payload
    finally:
        os.close(descriptor)


def _load_bounded_json_object(path: Path, *, maximum_bytes: int, label: str) -> dict[str, Any]:
    """Decode one bounded UTF-8 JSON object with duplicate-member rejection."""
    raw_bytes = _stable_regular_file_bytes(
        path, maximum_bytes=maximum_bytes, label=label
    )
    try:
        raw_text = raw_bytes.decode("utf-8")
        document = json.loads(raw_text, object_pairs_hook=_reject_duplicate_pairs)
    except (UnicodeError, json.JSONDecodeError) as decode_error:
        raise ValueError(f"{label} is not valid UTF-8 JSON") from decode_error
    if not isinstance(document, dict):
        raise ValueError(f"{label} must contain one JSON object")
    return document


def _required_trimmed_string(value: Any, *, field_name: str) -> str:
    """Return one non-empty trimmed policy string without coercion."""
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError(f"updater policy {field_name} must be a non-empty trimmed string")
    return value


def _validated_endpoints(value: Any) -> list[str]:
    """Return unique production HTTPS updater endpoints from policy authority."""
    if not isinstance(value, list) or not 1 <= len(value) <= _MAX_ENDPOINTS:
        raise ValueError("admitted updater policy requires one to four HTTPS endpoints")
    endpoints: list[str] = []
    for endpoint_value in value:
        endpoint = _required_trimmed_string(endpoint_value, field_name="endpoint")
        parsed = urlsplit(endpoint)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
        ):
            raise ValueError("admitted updater endpoint must use HTTPS without userinfo or fragment")
        endpoints.append(endpoint)
    if len(set(endpoints)) != len(endpoints):
        raise ValueError("admitted updater endpoints must be unique")
    return endpoints


def _validated_public_key(value: Any) -> str:
    """Return bounded literal public-key content for Tauri updater verification."""
    public_key = _required_trimmed_string(value, field_name="publicKey")
    if len(public_key) > _MAX_PUBLIC_KEY_CHARACTERS:
        raise ValueError("updater policy publicKey exceeds its bounded size policy")
    return public_key


def _validate_minimum_supported_version(value: Any) -> str:
    """Require a canonical SemVer minimum supported application version."""
    version = _required_trimmed_string(value, field_name="minimumSupportedVersion")
    if _SEMVER_RE.fullmatch(version) is None:
        raise ValueError("updater policy minimumSupportedVersion must be valid SemVer")
    return version


def _tauri_updater_config(tauri_document: dict[str, Any]) -> dict[str, Any] | None:
    """Return the configured Tauri updater object without inventing absent plugin state."""
    plugins = tauri_document.get("plugins")
    if plugins is None:
        return None
    if not isinstance(plugins, dict):
        raise ValueError("tauri.conf.json plugins must be an object")
    updater = plugins.get("updater")
    if updater is None:
        return None
    if not isinstance(updater, dict):
        raise ValueError("tauri.conf.json updater plugin config must be an object")
    return updater


def _create_updater_artifacts_value(tauri_document: dict[str, Any]) -> Any:
    """Return Tauri's updater-artifact generation setting or ``None`` when absent."""
    bundle = tauri_document.get("bundle")
    if bundle is None:
        return None
    if not isinstance(bundle, dict):
        raise ValueError("tauri.conf.json bundle must be an object")
    return bundle.get("createUpdaterArtifacts")


def verify_updater_policy(
    repository_root: Path, *, require_admitted: bool = False
) -> dict[str, Any]:
    """Verify updater authority and its exact Tauri projection for this repository."""
    policy = _load_bounded_json_object(
        repository_root / _POLICY_PATH,
        maximum_bytes=_MAX_POLICY_BYTES,
        label="release updater policy",
    )
    policy_keys = frozenset(policy)
    if policy_keys != _ALLOWED_POLICY_KEYS:
        missing = sorted(_ALLOWED_POLICY_KEYS - policy_keys)
        extra = sorted(policy_keys - _ALLOWED_POLICY_KEYS)
        detail_parts = []
        if missing:
            detail_parts.append(f"missing={','.join(missing)}")
        if extra:
            detail_parts.append(f"extra={','.join(extra)}")
        raise ValueError(
            "release updater policy keys must match the versioned contract"
            + (f" ({'; '.join(detail_parts)})" if detail_parts else "")
        )
    if policy.get("schemaVersion") != 1:
        raise ValueError("release updater policy schemaVersion must equal 1")
    state = policy.get("state")
    if state not in _ALLOWED_STATES:
        raise ValueError("release updater policy state must be blocked or admitted")
    channel = policy.get("channel")
    if channel not in _ALLOWED_CHANNELS:
        raise ValueError("release updater policy channel must be stable or beta")
    _validate_minimum_supported_version(policy.get("minimumSupportedVersion"))

    tauri_document = _load_bounded_json_object(
        repository_root / _TAURI_CONFIG_PATH,
        maximum_bytes=_MAX_TAURI_CONFIG_BYTES,
        label="tauri.conf.json",
    )
    updater_config = _tauri_updater_config(tauri_document)
    create_updater_artifacts = _create_updater_artifacts_value(tauri_document)

    if state == "blocked":
        if policy.get("publicKey") is not None or policy.get("endpoints") != []:
            raise ValueError("blocked updater policy cannot carry release authority")
        _required_trimmed_string(policy.get("reason"), field_name="reason")
        if create_updater_artifacts not in {None, False} or updater_config is not None:
            raise ValueError("blocked updater policy cannot enable Tauri updater capability")
        if require_admitted:
            raise ValueError("commercial updater policy is blocked")
        return policy

    if policy.get("reason") is not None:
        raise ValueError("admitted updater policy reason must be null")
    public_key = _validated_public_key(policy.get("publicKey"))
    endpoints = _validated_endpoints(policy.get("endpoints"))
    if create_updater_artifacts is not True:
        raise ValueError("admitted updater policy requires bundle.createUpdaterArtifacts=true")
    if updater_config is None:
        raise ValueError("admitted updater policy requires Tauri updater plugin config")
    if updater_config.get("dangerousInsecureTransportProtocol") is True:
        raise ValueError("admitted updater policy forbids insecure transport")
    if updater_config.get("pubkey") != public_key:
        raise ValueError("Tauri updater public key does not match release updater policy")
    if updater_config.get("endpoints") != endpoints:
        raise ValueError("Tauri updater endpoints do not match release updater policy")
    return policy


def main() -> int:
    """Verify repository updater policy, requiring admission for a version tag."""
    release_tag = (
        os.environ.get("GITHUB_REF_NAME")
        if os.environ.get("GITHUB_REF_TYPE") == "tag"
        else None
    )
    try:
        policy = verify_updater_policy(
            _REPOSITORY_ROOT, require_admitted=release_tag is not None
        )
    except ValueError as policy_error:
        print(f"release updater policy check failed: {policy_error}", file=sys.stderr)
        return 1
    print(
        "BandScope updater policy verified: "
        f"state={policy['state']} channel={policy['channel']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
