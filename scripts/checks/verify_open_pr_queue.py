#!/usr/bin/env python3
"""Fail closed when the BandScope product-readiness pull-request queue is inconsistent."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST_PATH = REPO_ROOT / "docs" / "product-readiness" / "open-pr-queue.json"
REPOSITORY = "ContextualWisdomLab/bandscope"
BASE_BRANCH = "develop"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)
ROOT_FIELDS = frozenset(
    {
        "schema_version",
        "snapshot_date",
        "timezone",
        "repository",
        "base_branch",
        "base_sha",
        "open_pr_count",
        "authority_note",
        "trains",
        "pull_requests",
    }
)
TRAIN_FIELDS = frozenset({"description", "issue"})
PULL_REQUEST_FIELDS = frozenset(
    {
        "number",
        "title",
        "url",
        "initial_train",
        "initial_disposition",
        "head_sha",
        "head_sha_status",
    }
)


class ManifestError(ValueError):
    """Raised when queue evidence is structurally inconsistent or ambiguous."""


def _fail(message: str) -> None:
    """Raise the stable manifest-validation exception."""
    raise ManifestError(message)


def _require_record(value: object, field: str) -> dict[str, Any]:
    """Return a JSON object or fail with a field-specific diagnostic."""
    if not isinstance(value, dict):
        _fail(f"{field} must be an object")
    return value


def _reject_unknown_fields(record: dict[str, Any], allowed: frozenset[str], field: str) -> None:
    """Reject evidence fields that are not part of the reviewed manifest schema."""
    unsupported = sorted(set(record) - allowed)
    if unsupported:
        _fail(f"{field} has unsupported field: {unsupported[0]}")


def _require_list(value: object, field: str) -> list[Any]:
    """Return a JSON array or fail with a field-specific diagnostic."""
    if not isinstance(value, list):
        _fail(f"{field} must be an array")
    return value


def _require_non_empty_string(value: object, field: str) -> str:
    """Return a non-empty string without coercing queue evidence."""
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        _fail(f"{field} must be a non-empty trim-stable string")
    return value


def _require_sha(value: object, field: str) -> str:
    """Return an immutable 40-hex Git commit identity."""
    text = _require_non_empty_string(value, field)
    if SHA_PATTERN.fullmatch(text) is None:
        _fail(f"{field} must be 40 hexadecimal characters")
    return text.lower()


def validate_manifest(manifest: object) -> None:
    """Validate intrinsic queue invariants without treating the seed as live GitHub evidence."""
    root = _require_record(manifest, "manifest")
    _reject_unknown_fields(root, ROOT_FIELDS, "manifest")
    if root.get("schema_version") != "1.0.0":
        _fail("schema_version must be 1.0.0")
    if root.get("repository") != REPOSITORY:
        _fail(f"repository must be {REPOSITORY}")
    if root.get("base_branch") != BASE_BRANCH:
        _fail(f"base_branch must be {BASE_BRANCH}")
    _require_sha(root.get("base_sha"), "base_sha")
    _require_non_empty_string(root.get("snapshot_date"), "snapshot_date")
    _require_non_empty_string(root.get("timezone"), "timezone")
    _require_non_empty_string(root.get("authority_note"), "authority_note")

    trains = _require_record(root.get("trains"), "trains")
    if not trains:
        _fail("trains must not be empty")
    for train_name, raw_train in trains.items():
        _require_non_empty_string(train_name, "train name")
        train = _require_record(raw_train, f"trains.{train_name}")
        _reject_unknown_fields(train, TRAIN_FIELDS, f"trains.{train_name}")
        _require_non_empty_string(train.get("description"), f"trains.{train_name}.description")
        issue = train.get("issue")
        if isinstance(issue, bool) or not isinstance(issue, int) or issue <= 0:
            _fail(f"trains.{train_name}.issue must be a positive integer")

    pull_requests = _require_list(root.get("pull_requests"), "pull_requests")
    open_pr_count = root.get("open_pr_count")
    if isinstance(open_pr_count, bool) or not isinstance(open_pr_count, int):
        _fail("open_pr_count must be an integer")
    if open_pr_count != len(pull_requests):
        _fail(
            f"open_pr_count must equal pull_requests length: {open_pr_count} != {len(pull_requests)}"
        )

    seen_numbers: set[int] = set()
    for index, raw_pr in enumerate(pull_requests):
        prefix = f"pull_requests[{index}]"
        pr = _require_record(raw_pr, prefix)
        _reject_unknown_fields(pr, PULL_REQUEST_FIELDS, prefix)
        number = pr.get("number")
        if isinstance(number, bool) or not isinstance(number, int) or number <= 0:
            _fail(f"{prefix}.number must be a positive integer")
        if number in seen_numbers:
            _fail(f"duplicate pull request number: {number}")
        seen_numbers.add(number)

        _require_non_empty_string(pr.get("title"), f"{prefix}.title")
        expected_url = f"https://github.com/{REPOSITORY}/pull/{number}"
        if pr.get("url") != expected_url:
            _fail(f"{prefix}.url must be {expected_url}")

        train_name = _require_non_empty_string(pr.get("initial_train"), f"{prefix}.initial_train")
        if train_name not in trains:
            _fail(f"{prefix}.initial_train references unknown train: {train_name}")
        _require_non_empty_string(pr.get("initial_disposition"), f"{prefix}.initial_disposition")

        head_sha = pr.get("head_sha")
        head_status = pr.get("head_sha_status")
        if head_sha is None:
            if head_status != "refresh_required_before_action":
                _fail(
                    f"{prefix}.head_sha_status must be refresh_required_before_action when head_sha is null"
                )
        else:
            _require_sha(head_sha, f"{prefix}.head_sha")
            if head_status != "exact_current_head":
                _fail(f"{prefix}.head_sha_status must be exact_current_head when head_sha is present")


def load_manifest(path: Path = DEFAULT_MANIFEST_PATH) -> object:
    """Load the queue JSON without accepting duplicate object keys silently."""

    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                _fail(f"duplicate JSON object key: {key}")
            result[key] = value
        return result

    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ManifestError(f"unable to read open PR queue manifest: {type(exc).__name__}") from exc


def main() -> int:
    """Validate the committed seed and return a shell-friendly status code."""
    try:
        validate_manifest(load_manifest())
    except ManifestError as exc:
        print(f"open PR queue verification failed: {exc}", file=sys.stderr)
        return 1
    print("open PR queue verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
