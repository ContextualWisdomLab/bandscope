#!/usr/bin/env python3
"""Validate Distribution-owned commercial model release admission.

The release policy is deliberately separate from Signal/MIR runtime model selection.
It answers whether a specific immutable model artifact may enter a BandScope release;
it does not claim scientific accuracy or create commercial rights.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from typing import Any

_POLICY_RELATIVE_PATH = Path("release/model-artifact-policy.json")
_MAX_POLICY_BYTES = 64 * 1024
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_ALLOWED_RELEASE_STATUSES = frozenset({"blocked", "admitted"})
_ALLOWED_SERIALIZATIONS = frozenset({"safetensors", "onnx", "pytorch-demucs-trusted"})
_POLICY_KEYS = frozenset(
    {"schemaVersion", "releaseStatus", "blockedArtifact", "admittedArtifact"}
)
_BLOCKED_ARTIFACT_KEYS = frozenset(
    {"modelId", "checkpoint", "reason", "primaryEvidence"}
)
_ADMITTED_ARTIFACT_KEYS = frozenset(
    {
        "modelId",
        "modelVersion",
        "path",
        "sizeBytes",
        "sha256",
        "serialization",
        "rightsEvidenceSha256",
        "provenanceEvidenceSha256",
        "loaderPolicySha256",
    }
)


def _reject_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a JSON object while rejecting last-value-wins authority ambiguity."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON member: {key}")
        result[key] = value
    return result


def _read_bounded_json(path: Path) -> dict[str, Any]:
    """Read one small regular non-link policy document with duplicate rejection."""
    if path.is_symlink():
        raise ValueError("model release policy must be a regular non-link file")
    try:
        metadata = path.stat()
    except FileNotFoundError as error:
        raise ValueError("model release policy is missing") from error
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError("model release policy must be a regular non-link file")
    if metadata.st_size <= 0 or metadata.st_size > _MAX_POLICY_BYTES:
        raise ValueError("model release policy exceeds its bounded size")

    with path.open("rb") as policy_file:
        payload = policy_file.read(_MAX_POLICY_BYTES + 1)
    if len(payload) != metadata.st_size or len(payload) > _MAX_POLICY_BYTES:
        raise ValueError("model release policy changed while being read")
    try:
        decoded = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("model release policy must be UTF-8") from error
    try:
        document = json.loads(decoded, object_pairs_hook=_reject_duplicate_members)
    except json.JSONDecodeError as error:
        raise ValueError("model release policy must be valid JSON") from error
    if not isinstance(document, dict):
        raise ValueError("model release policy root must be an object")
    return document


def _require_exact_keys(document: dict[str, Any], expected: frozenset[str], label: str) -> None:
    """Reject missing or unknown authority fields at a release trust boundary."""
    actual = frozenset(document)
    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)
    if missing:
        raise ValueError(f"missing {label} fields: {', '.join(missing)}")
    if unexpected:
        raise ValueError(f"unexpected {label} fields: {', '.join(unexpected)}")


def _bounded_text(value: Any, label: str, *, maximum: int = 512) -> str:
    """Admit one bounded single-line non-blank metadata string."""
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    if value != value.strip() or not value or len(value) > maximum:
        raise ValueError(f"{label} must be bounded non-blank text without padding")
    if "\n" in value or "\r" in value or "\x00" in value:
        raise ValueError(f"{label} must be a single-line text value")
    return value


def _full_sha256(value: Any, label: str) -> str:
    """Admit one lowercase full SHA-256 digest rather than a checksum prefix."""
    digest = _bounded_text(value, label, maximum=64)
    if _SHA256_PATTERN.fullmatch(digest) is None:
        raise ValueError(f"{label} must be a full SHA-256")
    return digest


def _repository_relative_path(value: Any) -> PurePosixPath:
    """Admit one normalized repository-relative artifact path without traversal."""
    path_text = _bounded_text(value, "model artifact path", maximum=512)
    if "\\" in path_text:
        raise ValueError("model artifact path must be repository-relative")
    candidate = PurePosixPath(path_text)
    if candidate.is_absolute() or any(part in {"", ".", ".."} for part in candidate.parts):
        raise ValueError("model artifact path must be repository-relative")
    if candidate.as_posix() != path_text:
        raise ValueError("model artifact path must be repository-relative")
    return candidate


def _validate_blocked_artifact(value: Any) -> dict[str, Any]:
    """Validate the immutable description of the currently prohibited upstream artifact."""
    if not isinstance(value, dict):
        raise ValueError("blockedArtifact must be an object")
    _require_exact_keys(value, _BLOCKED_ARTIFACT_KEYS, "blockedArtifact")
    _bounded_text(value["modelId"], "blockedArtifact.modelId", maximum=128)
    _bounded_text(value["checkpoint"], "blockedArtifact.checkpoint", maximum=256)
    _bounded_text(value["reason"], "blockedArtifact.reason", maximum=256)
    evidence = _bounded_text(
        value["primaryEvidence"], "blockedArtifact.primaryEvidence", maximum=1024
    )
    if not evidence.startswith("https://"):
        raise ValueError("blockedArtifact.primaryEvidence must use HTTPS")
    return value


def _validate_admitted_metadata(value: Any) -> dict[str, Any]:
    """Validate immutable metadata required before model bytes can be release authority."""
    if not isinstance(value, dict):
        raise ValueError("admittedArtifact must be an object")
    _require_exact_keys(value, _ADMITTED_ARTIFACT_KEYS, "admittedArtifact")
    _bounded_text(value["modelId"], "admittedArtifact.modelId", maximum=128)
    _bounded_text(value["modelVersion"], "admittedArtifact.modelVersion", maximum=128)
    _repository_relative_path(value["path"])
    size_bytes = value["sizeBytes"]
    if isinstance(size_bytes, bool) or not isinstance(size_bytes, int) or size_bytes <= 0:
        raise ValueError("admittedArtifact.sizeBytes must be a positive integer")
    _full_sha256(value["sha256"], "sha256")
    serialization = _bounded_text(
        value["serialization"], "admittedArtifact.serialization", maximum=64
    )
    if serialization not in _ALLOWED_SERIALIZATIONS:
        raise ValueError("admittedArtifact.serialization is not an admitted release format")
    _full_sha256(value["rightsEvidenceSha256"], "rightsEvidenceSha256")
    _full_sha256(value["provenanceEvidenceSha256"], "provenanceEvidenceSha256")
    _full_sha256(value["loaderPolicySha256"], "loaderPolicySha256")
    return value


def _verify_artifact_bytes(repository_root: Path, metadata: dict[str, Any]) -> None:
    """Verify exact regular model bytes against immutable size and full-digest metadata."""
    relative_path = _repository_relative_path(metadata["path"])
    artifact_path = repository_root.joinpath(*relative_path.parts)
    if artifact_path.is_symlink():
        raise ValueError("model artifact must be a regular non-link file")

    open_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        file_descriptor = os.open(artifact_path, open_flags)
    except FileNotFoundError as error:
        raise ValueError("model artifact is missing") from error
    except OSError as error:
        raise ValueError("model artifact must be a regular non-link file") from error

    try:
        initial_metadata = os.fstat(file_descriptor)
        if not stat.S_ISREG(initial_metadata.st_mode):
            raise ValueError("model artifact must be a regular non-link file")
        expected_size = metadata["sizeBytes"]
        if initial_metadata.st_size != expected_size:
            raise ValueError("model artifact size does not match policy")

        digest = hashlib.sha256()
        observed_size = 0
        while True:
            chunk = os.read(file_descriptor, 1024 * 1024)
            if not chunk:
                break
            observed_size += len(chunk)
            if observed_size > expected_size:
                raise ValueError("model artifact size does not match policy")
            digest.update(chunk)
        final_metadata = os.fstat(file_descriptor)
        if observed_size != expected_size or final_metadata.st_size != expected_size:
            raise ValueError("model artifact size does not match policy")
        if digest.hexdigest() != metadata["sha256"]:
            raise ValueError("model artifact SHA-256 does not match policy")
    finally:
        os.close(file_descriptor)


def verify_model_policy(
    repository_root: Path, *, require_admitted: bool = False
) -> dict[str, Any]:
    """Validate release model policy and optionally require exact admitted artifact bytes."""
    document = _read_bounded_json(repository_root / _POLICY_RELATIVE_PATH)
    _require_exact_keys(document, _POLICY_KEYS, "policy")
    if document["schemaVersion"] != 1:
        raise ValueError("model release policy schemaVersion must be 1")

    release_status = document["releaseStatus"]
    if release_status not in _ALLOWED_RELEASE_STATUSES:
        raise ValueError("model release policy releaseStatus is unsupported")
    _validate_blocked_artifact(document["blockedArtifact"])

    admitted_artifact = document["admittedArtifact"]
    if release_status == "blocked":
        if admitted_artifact is not None:
            raise ValueError("blocked model policy must not name an admittedArtifact")
        if require_admitted:
            raise ValueError("commercial model artifact is not admitted")
        return document

    admitted_metadata = _validate_admitted_metadata(admitted_artifact)
    _verify_artifact_bytes(repository_root, admitted_metadata)
    return document


def main(argv: list[str] | None = None) -> int:
    """Run the repository release model policy guard as a fail-closed CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repository-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Repository root containing release/model-artifact-policy.json.",
    )
    parser.add_argument(
        "--require-admitted",
        action="store_true",
        help="Require and byte-verify a commercially admitted model artifact.",
    )
    arguments = parser.parse_args(argv)
    try:
        policy = verify_model_policy(
            arguments.repository_root, require_admitted=arguments.require_admitted
        )
    except ValueError as error:
        print(f"Release model policy invalid: {error}", file=sys.stderr)
        return 1
    print(f"Release model policy: {policy['releaseStatus']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
