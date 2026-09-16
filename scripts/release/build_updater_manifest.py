#!/usr/bin/env python3
"""Build deterministic Tauri updater metadata from admitted release receipts.

Security Notes:
    This Distribution-owned builder does not discover or manufacture signing
    authority. It first re-admits the extracted release graph through
    ``select_release_assets`` and then derives one static updater entry per
    supported target from the exact receipt-bound bundle and signature bytes.
    Signature text is embedded only after a bounded stable regular-file read,
    an exact size/SHA-256 comparison against the target receipt, and validation
    of the canonical standard-base64/UTF-8 envelope consumed by Tauri before
    minisign verification. The BandScope extension binds each target's exact
    bundle size/digest, the full source commit, and the admitted
    minimum-supported-version policy so a future runtime can make
    replay/compatibility decisions from ``raw_json`` without trusting filenames
    or mutable release aliases. Release URLs are exact-tag HTTPS URLs; no
    mutable latest URL or untrusted receipt path is used as filesystem authority.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit

import select_release_assets as release_assets

_FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_REPOSITORY_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_SEMVER_RE = re.compile(
    r"^(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)"
    r"(?:-((?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
_MAX_VERSION_BYTES = 256
_MAX_SIGNATURE_BYTES = 64 * 1024
_MAX_POLICY_BYTES = 64 * 1024
_PLATFORM_KEYS = {
    ("windows", "amd64"): "windows-x86_64",
    ("windows", "arm64"): "windows-aarch64",
    ("macos", "amd64"): "darwin-x86_64",
    ("macos", "arm64"): "darwin-aarch64",
}


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build one JSON object while refusing parser-dependent duplicate members."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON member: {key}")
        result[key] = value
    return result


def _stable_read_bytes(path: Path, *, label: str, maximum_bytes: int) -> bytes:
    """Read one bounded regular non-link file from a stable descriptor."""
    if path.is_symlink():
        raise ValueError(f"{label} must be a regular non-link file")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ValueError(f"{label} could not be opened") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{label} must be a regular non-link file")
        if before.st_size < 1:
            raise ValueError(f"{label} must not be empty")
        if before.st_size > maximum_bytes:
            raise ValueError(f"{label} exceeds its bounded size policy")
        payload = bytearray()
        while len(payload) <= maximum_bytes:
            chunk = os.read(
                descriptor,
                min(64 * 1024, maximum_bytes + 1 - len(payload)),
            )
            if not chunk:
                break
            payload.extend(chunk)
        after = os.fstat(descriptor)
        if len(payload) > maximum_bytes:
            raise ValueError(f"{label} exceeds its bounded size policy")
        if (before.st_dev, before.st_ino, before.st_size) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
        ) or len(payload) != before.st_size:
            raise ValueError(f"{label} changed while being read")
        return bytes(payload)
    finally:
        os.close(descriptor)


def _version(repo_root: Path) -> str:
    """Return the exact authoritative VERSION value."""
    raw = _stable_read_bytes(
        repo_root / "VERSION", label="VERSION", maximum_bytes=_MAX_VERSION_BYTES
    )
    try:
        value = raw.decode("utf-8").strip()
    except UnicodeError as error:
        raise ValueError("VERSION must be UTF-8") from error
    if not value or value != value.strip() or any(
        character.isspace() for character in value
    ):
        raise ValueError("VERSION must contain one non-empty token")
    return value


def _minimum_supported_version(repo_root: Path) -> str:
    """Return the updater policy's version floor after bounded duplicate-safe admission."""
    raw = _stable_read_bytes(
        repo_root / "release" / "updater-policy.json",
        label="release updater policy",
        maximum_bytes=_MAX_POLICY_BYTES,
    )
    try:
        document = json.loads(
            raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_pairs
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("release updater policy must be valid UTF-8 JSON") from error
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise ValueError("release updater policy schemaVersion must equal 1")
    value = document.get("minimumSupportedVersion")
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or _SEMVER_RE.fullmatch(value) is None
    ):
        raise ValueError(
            "release updater policy minimumSupportedVersion must be valid SemVer"
        )
    return value


def _normalized_server_url(server_url: str) -> str:
    """Return one HTTPS release origin without mutable URL components."""
    parsed = urlsplit(server_url.strip())
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("release server URL must be an HTTPS origin")
    authority = parsed.hostname
    if parsed.port is not None:
        authority = f"{authority}:{parsed.port}"
    return f"https://{authority}"


def _normalized_repository(repository: str) -> str:
    """Return an exact owner/repository slug suitable for a release URL."""
    value = repository.strip()
    if _REPOSITORY_RE.fullmatch(value) is None:
        raise ValueError("repository must be an exact owner/name slug")
    return value


def _receipt_path(
    repo_root: Path, target: tuple[str, str], source_commit: str
) -> Path:
    """Return the fixed target receipt path for an exact release commit."""
    platform, arch = target
    return (
        repo_root
        / "artifacts"
        / f"bandscope-{platform}-{arch}-{source_commit[:12]}.release-receipt.json"
    )


def _exact_updater_entry(
    receipt: dict[str, Any], *, target: tuple[str, str]
) -> dict[str, Any]:
    """Return exactly one updater artifact for one static-manifest target."""
    entries = receipt.get("updaterArtifacts")
    if (
        not isinstance(entries, list)
        or len(entries) != 1
        or not isinstance(entries[0], dict)
    ):
        raise ValueError(
            f"exactly one updater artifact is required for {target[0]}-{target[1]}"
        )
    return entries[0]


def _updater_identity_metadata(
    entry: dict[str, Any], *, target: tuple[str, str]
) -> dict[str, object]:
    """Return bounded exact bundle identity for BandScope updater security metadata."""
    size_bytes = entry.get("sizeBytes")
    digest = entry.get("sha256")
    if (
        isinstance(size_bytes, bool)
        or not isinstance(size_bytes, int)
        or size_bytes < 1
    ):
        raise ValueError(
            f"updater bundle size is invalid for {target[0]}-{target[1]}"
        )
    if not isinstance(digest, str) or _SHA256_RE.fullmatch(digest) is None:
        raise ValueError(
            f"updater bundle digest is invalid for {target[0]}-{target[1]}"
        )
    return {"sizeBytes": size_bytes, "sha256": digest}


def _signature_text(
    repo_root: Path,
    *,
    entry: dict[str, Any],
    target: tuple[str, str],
) -> str:
    """Return receipt-bound Tauri signature content after exact byte admission."""
    signature_name = entry.get("signatureFile")
    if not isinstance(signature_name, str) or Path(signature_name).name != signature_name:
        raise ValueError("updater signature filename is invalid")
    signature_path = repo_root / "artifacts" / signature_name
    payload = _stable_read_bytes(
        signature_path,
        label=f"updater signature for {target[0]}-{target[1]}",
        maximum_bytes=_MAX_SIGNATURE_BYTES,
    )
    expected_size = entry.get("signatureSizeBytes")
    expected_digest = entry.get("signatureSha256")
    if (
        isinstance(expected_size, bool)
        or not isinstance(expected_size, int)
        or expected_size < 1
    ):
        raise ValueError("updater signature receipt size is invalid")
    if len(payload) != expected_size:
        raise ValueError("updater signature size does not match release receipt")
    digest = hashlib.sha256(payload).hexdigest()
    if not isinstance(expected_digest, str) or digest != expected_digest:
        raise ValueError("updater signature digest does not match release receipt")
    try:
        text = payload.decode("ascii")
    except UnicodeError as error:
        raise ValueError("updater signature must contain ASCII base64 text") from error
    if not text or text != text.strip() or "\x00" in text:
        raise ValueError("updater signature must contain canonical base64 text")
    try:
        decoded = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("updater signature must contain canonical base64 text") from error
    if base64.b64encode(decoded).decode("ascii") != text:
        raise ValueError("updater signature must contain canonical base64 text")
    try:
        decoded.decode("utf-8")
    except UnicodeError as error:
        raise ValueError("updater signature base64 payload must decode to UTF-8") from error
    return text


def build_manifest(
    repo_root: Path,
    *,
    source_commit: str,
    repository: str,
    server_url: str,
) -> dict[str, Any]:
    """Build deterministic Tauri static updater JSON from the exact release graph."""
    if _FULL_SHA_RE.fullmatch(source_commit) is None:
        raise ValueError("updater manifest requires a full lowercase 40-hex Git SHA")
    repository_slug = _normalized_repository(repository)
    release_origin = _normalized_server_url(server_url)

    # Reuse the Distribution publication admission owner before reading any
    # receipt-derived name. This rejects stray, incomplete, linked, or
    # digest-drifting installer/updater graphs before manifest construction.
    release_assets.select_release_assets(repo_root, git_sha=source_commit)

    version = _version(repo_root)
    minimum_supported_version = _minimum_supported_version(repo_root)
    platforms: dict[str, dict[str, str]] = {}
    artifact_identities: dict[str, dict[str, object]] = {}
    for target, platform_key in _PLATFORM_KEYS.items():
        receipt = release_assets._load_receipt(
            _receipt_path(repo_root, target, source_commit)
        )
        if receipt.get("version") != version or receipt.get("tag") != f"v{version}":
            raise ValueError("release receipt version/tag does not match VERSION")
        if receipt.get("sourceCommit") != source_commit:
            raise ValueError("release receipt sourceCommit does not match updater source")
        entry = _exact_updater_entry(receipt, target=target)
        bundle_name = entry.get("bundle")
        if not isinstance(bundle_name, str) or Path(bundle_name).name != bundle_name:
            raise ValueError("updater bundle filename is invalid")
        signature = _signature_text(
            repo_root,
            entry=entry,
            target=target,
        )
        download_url = (
            f"{release_origin}/{repository_slug}/releases/download/"
            f"v{quote(version, safe='')}/{quote(bundle_name, safe='')}"
        )
        platforms[platform_key] = {
            "signature": signature,
            "url": download_url,
        }
        artifact_identities[platform_key] = _updater_identity_metadata(
            entry, target=target
        )

    return {
        "version": version,
        "platforms": platforms,
        "bandscope": {
            "schemaVersion": 1,
            "sourceCommit": source_commit,
            "minimumSupportedVersion": minimum_supported_version,
            "artifacts": artifact_identities,
        },
    }


def _manifest_bytes(manifest: dict[str, Any]) -> bytes:
    """Serialize the static updater manifest deterministically."""
    return (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _write_atomically(path: Path, payload: bytes) -> None:
    """Publish manifest bytes atomically and sync the containing directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    stage = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
        descriptor = os.open(stage, flags, 0o644)
        try:
            with os.fdopen(descriptor, "wb", closefd=False) as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.replace(stage, path)
        if os.name != "nt":
            directory_descriptor = os.open(
                path.parent,
                os.O_RDONLY | getattr(os, "O_CLOEXEC", 0),
            )
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
    finally:
        try:
            stage.unlink()
        except FileNotFoundError:
            # A successful os.replace consumed the staged pathname.
            pass


def _check_output(path: Path, expected: bytes) -> None:
    """Fail closed when an existing publication manifest drifted after generation."""
    actual = _stable_read_bytes(
        path,
        label="updater manifest",
        maximum_bytes=max(len(expected), 256 * 1024),
    )
    if actual != expected:
        raise ValueError(
            "updater manifest does not match receipt-authorized release bytes"
        )


def main() -> int:
    """Build or verify one deterministic static updater manifest."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--git-sha", default=os.environ.get("GITHUB_SHA", ""))
    parser.add_argument(
        "--repository", default=os.environ.get("GITHUB_REPOSITORY", "")
    )
    parser.add_argument(
        "--server-url", default=os.environ.get("GITHUB_SERVER_URL", "")
    )
    parser.add_argument("--output", type=Path, default=Path("latest.json"))
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the existing output instead of rewriting it.",
    )
    args = parser.parse_args()

    try:
        manifest = build_manifest(
            args.repo_root,
            source_commit=str(args.git_sha).lower(),
            repository=str(args.repository),
            server_url=str(args.server_url),
        )
        payload = _manifest_bytes(manifest)
        output = args.output
        if not output.is_absolute():
            output = args.repo_root / output
        if args.check:
            _check_output(output, payload)
        else:
            _write_atomically(output, payload)
    except (OSError, ValueError) as error:
        print(f"Updater manifest validation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
