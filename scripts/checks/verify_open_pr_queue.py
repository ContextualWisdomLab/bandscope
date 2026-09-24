#!/usr/bin/env python3
"""Fail closed when the BandScope product-readiness pull-request queue is inconsistent."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
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
        "base_ref",
        "base_sha",
        "head_sha",
        "head_sha_status",
        "draft",
        "updated_at",
        "predecessor_prs",
        "overlap_prs",
        "successor_pr",
        "disposition",
        "decision_timestamp",
        "decision_rationale",
        "decision_owner",
    }
)
ALLOWED_INITIAL_DISPOSITIONS = frozenset(
    {
        "analysis_failure_next_action_copy",
        "canonical_audio_resource_policy",
        "canonical_dependency_security_base",
        "canonical_local_audio_resource_policy",
        "canonical_python_branch_coverage_base",
        "figma_contract_inventory_drift_check",
        "first_run_analyze_entry",
        "first_run_own_song_action",
        "help_next_action_copy",
        "inbound_handoff_reanalysis_slice",
        "licensed_demo_first_run_activation",
        "local_intake_failure_next_action_copy",
        "observation_probability_vectorization",
        "outbound_naruon_handoff_contract",
        "player_first_section_loop",
        "product_readiness_baseline_program",
        "project_atomic_publication",
        "project_save_load_failure_next_action_copy",
        "real_audio_accuracy_slice_under_issue_770",
        "storybook_design_inventory_slice",
        "support_manifest_boundary",
        "triage_required",
        "workspace_rehearsal_map_slice",
        "youtube_import_failure_next_action_copy",
    }
)
ALLOWED_DISPOSITIONS = frozenset(
    {
        "canonical_active",
        "stacked_after",
        "refresh_required",
        "superseded_by",
        "duplicate_of",
        "invalid_or_out_of_scope",
        "blocked_by_external_owner",
    }
)
DECISION_FIELDS = frozenset(
    {"disposition", "decision_timestamp", "decision_rationale", "decision_owner"}
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


def _require_github_timestamp(value: object, field: str) -> str:
    """Return a strict UTC GitHub timestamp so freshness evidence is unambiguous."""
    text = _require_non_empty_string(value, field)
    try:
        datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as exc:
        raise ManifestError(f"{field} must use YYYY-MM-DDTHH:MM:SSZ") from exc
    return text


def _require_pr_numbers(value: object, field: str) -> list[int]:
    """Return a duplicate-free list of positive PR identities."""
    pr_numbers = _require_list(value, field)
    normalized: list[int] = []
    seen: set[int] = set()
    for index, pr_number in enumerate(pr_numbers):
        if isinstance(pr_number, bool) or not isinstance(pr_number, int) or pr_number <= 0:
            _fail(f"{field}[{index}] must be a positive integer")
        if pr_number in seen:
            _fail(f"{field} contains duplicate pull request: {pr_number}")
        seen.add(pr_number)
        normalized.append(pr_number)
    return normalized


def _require_optional_pr_number(value: object, field: str) -> int | None:
    """Return a nullable positive PR identity without accepting booleans."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        _fail(f"{field} must be null or a positive integer")
    return value


def _validate_reviewed_disposition(
    pr: dict[str, Any],
    *,
    prefix: str,
    predecessors: list[int],
    successor: int | None,
) -> None:
    """Validate optional legacy-compatible reviewed routing without inventing decisions."""
    present = DECISION_FIELDS.intersection(pr)
    if not present:
        return
    if "disposition" not in pr:
        _fail(f"{prefix}.disposition is required when decision metadata is present")

    disposition = _require_non_empty_string(pr.get("disposition"), f"{prefix}.disposition")
    if disposition not in ALLOWED_DISPOSITIONS:
        _fail(f"{prefix}.disposition is unsupported: {disposition}")

    if disposition == "refresh_required":
        missing = DECISION_FIELDS - set(pr)
        if missing:
            _fail(f"{prefix} refresh_required decision must include explicit null metadata")
        for field in ("decision_timestamp", "decision_rationale", "decision_owner"):
            if pr.get(field) is not None:
                _fail(f"{prefix}.{field} must be null while disposition is refresh_required")
    else:
        missing = DECISION_FIELDS - set(pr)
        if missing:
            _fail(f"{prefix} reviewed decision metadata is incomplete")
        _require_github_timestamp(pr.get("decision_timestamp"), f"{prefix}.decision_timestamp")
        _require_non_empty_string(pr.get("decision_rationale"), f"{prefix}.decision_rationale")
        _require_non_empty_string(pr.get("decision_owner"), f"{prefix}.decision_owner")

    if disposition == "stacked_after" and not predecessors:
        _fail(f"{prefix}.stacked_after requires at least one predecessor_prs entry")
    if disposition in {"superseded_by", "duplicate_of"} and successor is None:
        _fail(f"{prefix}.{disposition} requires successor_pr")


def _validate_predecessor_graph(
    predecessors_by_pr: dict[int, list[int]], known_prs: set[int]
) -> None:
    """Reject unknown dependency identities and directed predecessor cycles."""
    for number, predecessors in predecessors_by_pr.items():
        for predecessor in predecessors:
            if predecessor not in known_prs:
                _fail(f"pull request {number} references unknown predecessor: {predecessor}")
            if predecessor == number:
                _fail(f"pull request {number} has a predecessor cycle")

    visiting: set[int] = set()
    visited: set[int] = set()

    def visit(number: int) -> None:
        if number in visited:
            return
        if number in visiting:
            _fail(f"predecessor cycle detected at pull request {number}")
        visiting.add(number)
        for predecessor in predecessors_by_pr.get(number, []):
            visit(predecessor)
        visiting.remove(number)
        visited.add(number)

    for number in known_prs:
        visit(number)


def _validate_overlap_and_successor_graph(
    overlaps_by_pr: dict[int, list[int]],
    successor_by_pr: dict[int, int | None],
    known_prs: set[int],
) -> None:
    """Require symmetric overlap evidence and an acyclic explicit succession relation."""
    for number, overlaps in overlaps_by_pr.items():
        for overlap in overlaps:
            if overlap not in known_prs:
                _fail(f"pull request {number} references unknown overlap: {overlap}")
            if overlap == number:
                _fail(f"pull request {number} cannot overlap itself")
            if number not in overlaps_by_pr.get(overlap, []):
                _fail(f"pull request overlap must be symmetric: {number} <-> {overlap}")

    for number, successor in successor_by_pr.items():
        if successor is None:
            continue
        if successor not in known_prs:
            _fail(f"pull request {number} references unknown successor: {successor}")
        if successor == number:
            _fail(f"pull request {number} cannot succeed itself")
        if successor not in overlaps_by_pr.get(number, []):
            _fail(f"pull request {number} successor_pr must also be declared in overlap_prs")

    visiting: set[int] = set()
    visited: set[int] = set()

    def visit(number: int) -> None:
        if number in visited:
            return
        if number in visiting:
            _fail(f"successor cycle detected at pull request {number}")
        visiting.add(number)
        successor = successor_by_pr.get(number)
        if successor is not None:
            visit(successor)
        visiting.remove(number)
        visited.add(number)

    for number in known_prs:
        visit(number)


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
    predecessors_by_pr: dict[int, list[int]] = {}
    overlaps_by_pr: dict[int, list[int]] = {}
    successor_by_pr: dict[int, int | None] = {}
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
        predecessors = _require_pr_numbers(
            pr.get("predecessor_prs", []), f"{prefix}.predecessor_prs"
        )
        overlaps = _require_pr_numbers(pr.get("overlap_prs", []), f"{prefix}.overlap_prs")
        successor = _require_optional_pr_number(pr.get("successor_pr"), f"{prefix}.successor_pr")
        predecessors_by_pr[number] = predecessors
        overlaps_by_pr[number] = overlaps
        successor_by_pr[number] = successor

        _require_non_empty_string(pr.get("title"), f"{prefix}.title")
        expected_url = f"https://github.com/{REPOSITORY}/pull/{number}"
        if pr.get("url") != expected_url:
            _fail(f"{prefix}.url must be {expected_url}")

        train_name = _require_non_empty_string(pr.get("initial_train"), f"{prefix}.initial_train")
        if train_name not in trains:
            _fail(f"{prefix}.initial_train references unknown train: {train_name}")
        initial_disposition = _require_non_empty_string(
            pr.get("initial_disposition"), f"{prefix}.initial_disposition"
        )
        if initial_disposition not in ALLOWED_INITIAL_DISPOSITIONS:
            _fail(f"{prefix}.initial_disposition is unsupported: {initial_disposition}")

        base_ref = pr.get("base_ref")
        pr_base_sha = pr.get("base_sha")
        if (base_ref is None) != (pr_base_sha is None):
            _fail(f"{prefix}.base_ref and {prefix}.base_sha must be present together")
        if base_ref is not None:
            _require_non_empty_string(base_ref, f"{prefix}.base_ref")
            _require_sha(pr_base_sha, f"{prefix}.base_sha")

        if "head_sha" not in pr:
            _fail(f"{prefix}.head_sha is required")
        head_sha = pr["head_sha"]
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

        if "draft" in pr and not isinstance(pr["draft"], bool):
            _fail(f"{prefix}.draft must be boolean")
        if "updated_at" in pr:
            _require_github_timestamp(pr["updated_at"], f"{prefix}.updated_at")

        _validate_reviewed_disposition(
            pr,
            prefix=prefix,
            predecessors=predecessors,
            successor=successor,
        )

    _validate_predecessor_graph(predecessors_by_pr, seen_numbers)
    _validate_overlap_and_successor_graph(overlaps_by_pr, successor_by_pr, seen_numbers)


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
