#!/usr/bin/env python3
"""Refresh the BandScope open-PR readiness manifest from bounded live GitHub evidence."""

from __future__ import annotations

import http.client
import json
import os
import re
import sys
import urllib.parse
from collections.abc import Callable
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from verify_open_pr_queue import ManifestError, load_manifest, validate_manifest

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "docs" / "product-readiness" / "open-pr-queue.json"
REPOSITORY = "ContextualWisdomLab/bandscope"
BASE_BRANCH = "develop"
GITHUB_API_HOST = "api.github.com"
REPOSITORY_API_PREFIX = f"/repos/{REPOSITORY}/"
BRANCH_REF_PREFIX = "refs/heads/"
PAGE_SIZE = 100
MAX_PAGES = 10
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
UNTRIAGED_TRAIN = "T8"
UNTRIAGED_DESCRIPTION = "Live additions awaiting explicit merge-train triage"
UNTRIAGED_ISSUE = 966
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)
PageFetcher = Callable[[int, int], tuple[list[dict[str, Any]], bool]]


class RefreshError(ValueError):
    """Raised when live queue evidence is incomplete, malformed, or ambiguous."""


def _fail(message: str) -> None:
    """Raise the stable live-refresh exception."""
    raise RefreshError(message)


def _require_record(value: object, field: str) -> dict[str, Any]:
    """Return a mapping or fail with a field-specific diagnostic."""
    if not isinstance(value, dict):
        _fail(f"{field} must be an object")
    return value


def _require_list(value: object, field: str) -> list[Any]:
    """Return a list or fail with a field-specific diagnostic."""
    if not isinstance(value, list):
        _fail(f"{field} must be an array")
    return value


def _require_text(value: object, field: str) -> str:
    """Return trim-stable non-empty text without coercion."""
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        _fail(f"{field} must be a non-empty trim-stable string")
    return value


def _require_sha(value: object, field: str) -> str:
    """Return a normalized immutable Git commit SHA."""
    text = _require_text(value, field)
    if SHA_PATTERN.fullmatch(text) is None:
        _fail(f"{field} must be 40 hexadecimal characters")
    return text.lower()


def _require_positive_int(value: object, field: str) -> int:
    """Return a positive integer without accepting booleans."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        _fail(f"{field} must be a positive integer")
    return value


def _require_github_timestamp(value: object, field: str) -> str:
    """Return a strict UTC GitHub timestamp for queue-freshness evidence."""
    text = _require_text(value, field)
    try:
        datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as exc:
        raise RefreshError(f"{field} must use YYYY-MM-DDTHH:MM:SSZ") from exc
    return text


def _normalize_base_tips(base_tips: object | None, protected_base_sha: str) -> dict[str, str]:
    """Normalize independently resolved target-branch tips used by live PR records."""
    if base_tips is None:
        return {BASE_BRANCH: protected_base_sha}
    base_tip_record = _require_record(base_tips, "base_tips")
    normalized: dict[str, str] = {}
    for raw_ref, raw_sha in base_tip_record.items():
        branch_ref = _require_text(raw_ref, "base_tips branch ref")
        normalized[branch_ref] = _require_sha(raw_sha, f"base_tips.{branch_ref}")
    if normalized.get(BASE_BRANCH) != protected_base_sha:
        _fail(f"base_tips.{BASE_BRANCH} must match the protected base_sha")
    return normalized


def collect_paginated_pulls(
    fetch_page: PageFetcher,
    *,
    page_size: int = PAGE_SIZE,
    max_pages: int = MAX_PAGES,
) -> dict[str, object]:
    """Collect every announced page or fail instead of returning partial evidence."""
    _require_positive_int(page_size, "page_size")
    _require_positive_int(max_pages, "max_pages")
    pull_requests: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        items, has_next = fetch_page(page, page_size)
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            _fail(f"pull request page {page} must contain objects")
        if not isinstance(has_next, bool):
            _fail(f"pull request page {page} next-page marker must be boolean")
        if has_next and not items:
            _fail(f"pull request page {page} is empty but announces another page")
        pull_requests.extend(items)
        if not has_next:
            return {"incomplete_results": False, "pull_requests": pull_requests}
    _fail("live pull-request pagination bound would truncate the queue")


def collect_paginated_branch_refs(
    fetch_page: PageFetcher,
    *,
    page_size: int = PAGE_SIZE,
    max_pages: int = MAX_PAGES,
) -> list[dict[str, Any]]:
    """Collect every announced branch-ref page or fail rather than truncate base authority."""
    _require_positive_int(page_size, "page_size")
    _require_positive_int(max_pages, "max_pages")
    branch_refs: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        items, has_next = fetch_page(page, page_size)
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            _fail(f"branch-ref page {page} must contain objects")
        if not isinstance(has_next, bool):
            _fail(f"branch-ref page {page} next-page marker must be boolean")
        if has_next and not items:
            _fail(f"branch-ref page {page} is empty but announces another page")
        branch_refs.extend(items)
        if not has_next:
            return branch_refs
    _fail("live branch-ref pagination bound would truncate the inventory")


def _decision_metadata_for_live_head(
    prior: dict[str, Any] | None,
    current_head_sha: str,
    current_base_ref: str,
    current_base_sha: str,
) -> dict[str, object]:
    """Preserve review only while exact PR head and target-base identity are unchanged."""
    if (
        prior is None
        or prior.get("head_sha") != current_head_sha
        or prior.get("base_ref") != current_base_ref
        or prior.get("base_sha") != current_base_sha
        or "disposition" not in prior
    ):
        return {
            "disposition": "refresh_required",
            "decision_timestamp": None,
            "decision_rationale": None,
            "decision_owner": None,
        }
    return {
        "disposition": prior.get("disposition"),
        "decision_timestamp": prior.get("decision_timestamp"),
        "decision_rationale": prior.get("decision_rationale"),
        "decision_owner": prior.get("decision_owner"),
    }


def _invalidate_decisions_after_related_identity_movement(
    refreshed_items: list[dict[str, object]],
    existing: dict[int, dict[str, Any]],
) -> None:
    """Invalidate reviewed routing when any referenced PR head or target-base identity moved."""
    current_by_number = {int(item["number"]): item for item in refreshed_items}
    for entry in refreshed_items:
        number = int(entry["number"])
        prior = existing.get(number)
        if prior is None or entry.get("disposition") == "refresh_required":
            continue

        related_numbers = set(prior.get("predecessor_prs", []))
        related_numbers.update(prior.get("overlap_prs", []))
        successor = prior.get("successor_pr")
        if successor is not None:
            related_numbers.add(successor)

        for related_number in related_numbers:
            reviewed_related = existing.get(related_number)
            current_related = current_by_number.get(related_number)
            if reviewed_related is None or current_related is None:
                entry.update(
                    {
                        "disposition": "refresh_required",
                        "decision_timestamp": None,
                        "decision_rationale": None,
                        "decision_owner": None,
                    }
                )
                break
            if any(
                reviewed_related.get(field) != current_related.get(field)
                for field in ("head_sha", "base_ref", "base_sha")
            ):
                entry.update(
                    {
                        "disposition": "refresh_required",
                        "decision_timestamp": None,
                        "decision_rationale": None,
                        "decision_owner": None,
                    }
                )
                break


def _live_pr_entry(
    raw_pr: object,
    *,
    index: int,
    base_tips: dict[str, str],
    existing: dict[int, dict[str, Any]],
) -> dict[str, object]:
    """Convert one trusted pulls-API record into the reviewed manifest schema."""
    pr = _require_record(raw_pr, f"pull_requests[{index}]")
    number = _require_positive_int(pr.get("number"), f"pull_requests[{index}].number")
    if pr.get("state") != "open":
        _fail(f"pull_requests[{index}].state must be open")
    title = _require_text(pr.get("title"), f"pull_requests[{index}].title")
    expected_url = f"https://github.com/{REPOSITORY}/pull/{number}"
    if pr.get("html_url") != expected_url:
        _fail(f"pull_requests[{index}].html_url must be {expected_url}")
    draft = pr.get("draft")
    if not isinstance(draft, bool):
        _fail(f"pull_requests[{index}].draft must be boolean")
    updated_at = _require_github_timestamp(
        pr.get("updated_at"), f"pull_requests[{index}].updated_at"
    )

    base = _require_record(pr.get("base"), f"pull_requests[{index}].base")
    base_ref = _require_text(base.get("ref"), f"pull_requests[{index}].base.ref")
    resolved_base_sha = base_tips.get(base_ref)
    if resolved_base_sha is None:
        _fail(f"pull_requests[{index}].base.ref has no independently resolved base tip")
    # The pull object can retain an older target SHA when its target branch advances.
    # Validate that snapshot as untrusted input, but do not let it override the branch lookup.
    _require_sha(base.get("sha"), f"pull_requests[{index}].base.sha")

    head = _require_record(pr.get("head"), f"pull_requests[{index}].head")
    head_sha = _require_sha(head.get("sha"), f"pull_requests[{index}].head.sha")

    prior = existing.get(number)
    if prior is None:
        initial_train = UNTRIAGED_TRAIN
        initial_disposition = "triage_required"
        predecessor_prs: list[Any] = []
        overlap_prs: list[Any] = []
        successor_pr: int | None = None
    else:
        initial_train = _require_text(prior.get("initial_train"), "existing.initial_train")
        initial_disposition = _require_text(
            prior.get("initial_disposition"), "existing.initial_disposition"
        )
        predecessor_prs = list(
            _require_list(prior.get("predecessor_prs", []), "existing.predecessor_prs")
        )
        overlap_prs = list(_require_list(prior.get("overlap_prs", []), "existing.overlap_prs"))
        successor_pr = prior.get("successor_pr")
    decision = _decision_metadata_for_live_head(
        prior,
        head_sha,
        base_ref,
        resolved_base_sha,
    )

    return {
        "number": number,
        "title": title,
        "url": expected_url,
        "initial_train": initial_train,
        "initial_disposition": initial_disposition,
        "base_ref": base_ref,
        "base_sha": resolved_base_sha,
        "head_sha": head_sha,
        "head_sha_status": "exact_current_head",
        "draft": draft,
        "updated_at": updated_at,
        "predecessor_prs": predecessor_prs,
        "overlap_prs": overlap_prs,
        "successor_pr": successor_pr,
        **decision,
    }


def build_refreshed_manifest(
    seed: object,
    live_result: object,
    *,
    base_sha: str,
    snapshot_date: str,
    base_tips: object | None = None,
) -> dict[str, Any]:
    """Build a deterministic complete queue while preserving reviewed routing metadata."""
    try:
        validate_manifest(seed)
    except ManifestError as exc:
        raise RefreshError(f"seed manifest is invalid: {exc}") from exc
    seed_record = _require_record(seed, "seed")
    live = _require_record(live_result, "live result")
    if live.get("incomplete_results") is not False:
        _fail("live pull-request inventory is incomplete")
    pulls = _require_list(live.get("pull_requests"), "live result.pull_requests")
    normalized_base_sha = _require_sha(base_sha, "base_sha")
    normalized_base_tips = _normalize_base_tips(base_tips, normalized_base_sha)
    try:
        datetime.strptime(snapshot_date, "%Y-%m-%d")
    except (TypeError, ValueError) as exc:
        raise RefreshError("snapshot_date must use YYYY-MM-DD") from exc

    existing_items = _require_list(seed_record.get("pull_requests"), "seed.pull_requests")
    existing: dict[int, dict[str, Any]] = {}
    for index, raw_pr in enumerate(existing_items):
        pr = _require_record(raw_pr, f"seed.pull_requests[{index}]")
        number = _require_positive_int(pr.get("number"), f"seed.pull_requests[{index}].number")
        existing[number] = pr

    seen: set[int] = set()
    refreshed_items: list[dict[str, object]] = []
    for index, raw_pr in enumerate(pulls):
        entry = _live_pr_entry(
            raw_pr,
            index=index,
            base_tips=normalized_base_tips,
            existing=existing,
        )
        number = int(entry["number"])
        if number in seen:
            _fail(f"duplicate pull request number: {number}")
        seen.add(number)
        refreshed_items.append(entry)
    refreshed_items.sort(key=lambda item: int(item["number"]))
    _invalidate_decisions_after_related_identity_movement(refreshed_items, existing)

    refreshed = deepcopy(seed_record)
    trains = _require_record(refreshed.get("trains"), "seed.trains")
    expected_untriaged = {"description": UNTRIAGED_DESCRIPTION, "issue": UNTRIAGED_ISSUE}
    prior_untriaged = trains.get(UNTRIAGED_TRAIN)
    if prior_untriaged is not None and prior_untriaged != expected_untriaged:
        _fail(f"{UNTRIAGED_TRAIN} is already assigned to a different routing authority")
    trains[UNTRIAGED_TRAIN] = expected_untriaged
    refreshed["base_sha"] = normalized_base_sha
    refreshed["snapshot_date"] = snapshot_date
    refreshed["open_pr_count"] = len(refreshed_items)
    refreshed["authority_note"] = (
        "Generated from a complete live GitHub open-PR inventory. Refresh checks, reviews, "
        "threads, ancestry, and writer evidence immediately before action."
    )
    refreshed["pull_requests"] = refreshed_items
    try:
        validate_manifest(refreshed)
    except ManifestError as exc:
        raise RefreshError(f"refreshed manifest is invalid: {exc}") from exc
    return refreshed


def _request_github_json(target: str, token: str | None) -> tuple[object, str]:
    """Read bounded JSON through a fixed GitHub host and repository-relative request target."""
    target = _require_text(target, "GitHub repository path")
    if not target.startswith(REPOSITORY_API_PREFIX) or "://" in target or "\n" in target or "\r" in target:
        _fail("GitHub repository path escaped the canonical repository")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bandscope-open-pr-queue-refresh",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # Python >=3.12 verifies HTTPS certificates by default; the host and target
    # are both fixed/validated above, so this generic legacy-version warning is
    # a false positive for BandScope's declared runtime contract.
    connection = http.client.HTTPSConnection(  # nosemgrep: python.lang.security.audit.httpsconnection-detected.httpsconnection-detected
        GITHUB_API_HOST,
        timeout=20,
    )
    try:
        connection.request("GET", target, headers=headers)
        response = connection.getresponse()
        if response.status != 200:
            _fail(f"GitHub API request failed with HTTP status {response.status}")
        encoded = response.read(MAX_RESPONSE_BYTES + 1)
        if len(encoded) > MAX_RESPONSE_BYTES:
            _fail("GitHub API response exceeded the bounded response size")
        payload = json.loads(encoded.decode("utf-8"))
        link = response.getheader("Link", "") or ""
        if not isinstance(link, str):
            _fail("GitHub API Link header must be text")
    except (OSError, UnicodeError, json.JSONDecodeError, http.client.HTTPException) as exc:
        raise RefreshError(f"GitHub API request failed: {type(exc).__name__}") from exc
    finally:
        connection.close()
    return payload, link


def fetch_live_branch_sha(branch_ref: str, token: str | None) -> str:
    """Resolve one current same-repository base branch tip through a fixed API authority."""
    normalized_ref = _require_text(branch_ref, "branch_ref")
    encoded_ref = urllib.parse.quote(normalized_ref, safe="")
    target = f"{REPOSITORY_API_PREFIX}branches/{encoded_ref}"
    payload, _ = _request_github_json(target, token)
    branch = _require_record(payload, "branch")
    commit = _require_record(branch.get("commit"), "branch.commit")
    return _require_sha(commit.get("sha"), "branch.commit.sha")


def fetch_live_branch_ref_page(
    page: int,
    page_size: int,
    token: str | None,
) -> tuple[list[dict[str, Any]], bool]:
    """Fetch one bounded page of repository branch refs for exact target-tip resolution."""
    _require_positive_int(page, "page")
    _require_positive_int(page_size, "page_size")
    query = urllib.parse.urlencode({"per_page": page_size, "page": page})
    target = f"{REPOSITORY_API_PREFIX}git/matching-refs/heads/?{query}"
    payload, link = _request_github_json(target, token)
    items = _require_list(payload, f"branch-ref page {page}")
    if any(not isinstance(item, dict) for item in items):
        _fail(f"branch-ref page {page} must contain objects")
    return items, 'rel="next"' in link


def fetch_live_branch_index(token: str | None) -> dict[str, str]:
    """Resolve all branch tips from a complete bounded Git refs inventory."""
    refs = collect_paginated_branch_refs(
        lambda page, size: fetch_live_branch_ref_page(page, size, token)
    )
    branch_index: dict[str, str] = {}
    for index, raw_ref in enumerate(refs):
        ref_record = _require_record(raw_ref, f"branch snapshot[{index}]")
        full_ref = _require_text(ref_record.get("ref"), f"branch snapshot[{index}].ref")
        if not full_ref.startswith(BRANCH_REF_PREFIX) or full_ref == BRANCH_REF_PREFIX:
            _fail(f"branch snapshot[{index}].ref must be a refs/heads branch")
        branch_ref = full_ref[len(BRANCH_REF_PREFIX) :]
        target_object = _require_record(
            ref_record.get("object"), f"branch snapshot[{index}].object"
        )
        if target_object.get("type") != "commit":
            _fail(f"branch snapshot[{index}].object.type must be commit")
        branch_sha = _require_sha(
            target_object.get("sha"), f"branch snapshot[{index}].object.sha"
        )
        if branch_ref in branch_index:
            _fail(f"branch snapshot contains duplicate branch ref: {branch_ref}")
        branch_index[branch_ref] = branch_sha
    if BASE_BRANCH not in branch_index:
        _fail(f"live branch snapshot is missing protected base {BASE_BRANCH}")
    return branch_index


def fetch_live_base_sha(token: str | None) -> str:
    """Resolve the current protected develop tip for backward-compatible callers."""
    return fetch_live_branch_sha(BASE_BRANCH, token)


def fetch_live_pull_page(
    page: int,
    page_size: int,
    token: str | None,
) -> tuple[list[dict[str, Any]], bool]:
    """Fetch one bounded page of all open PRs so stacked bases remain in the queue."""
    _require_positive_int(page, "page")
    _require_positive_int(page_size, "page_size")
    query = urllib.parse.urlencode(
        {
            "state": "open",
            "per_page": page_size,
            "page": page,
            "sort": "created",
            "direction": "asc",
        }
    )
    target = f"{REPOSITORY_API_PREFIX}pulls?{query}"
    payload, link = _request_github_json(target, token)
    items = _require_list(payload, f"pull request page {page}")
    if any(not isinstance(item, dict) for item in items):
        _fail(f"pull request page {page} must contain objects")
    return items, 'rel="next"' in link


def resolve_live_base_tips(live_result: object, token: str | None) -> dict[str, str]:
    """Select every current PR target from one independently resolved branch inventory."""
    live = _require_record(live_result, "live result")
    if live.get("incomplete_results") is not False:
        _fail("live pull-request inventory is incomplete")
    pulls = _require_list(live.get("pull_requests"), "live result.pull_requests")
    base_refs: set[str] = {BASE_BRANCH}
    for index, raw_pr in enumerate(pulls):
        pr = _require_record(raw_pr, f"pull_requests[{index}]")
        base = _require_record(pr.get("base"), f"pull_requests[{index}].base")
        base_refs.add(_require_text(base.get("ref"), f"pull_requests[{index}].base.ref"))

    branch_index = fetch_live_branch_index(token)
    missing = sorted(base_refs - branch_index.keys())
    if missing:
        _fail(f"target base ref is absent from the live branch snapshot: {missing[0]}")
    return {branch_ref: branch_index[branch_ref] for branch_ref in sorted(base_refs)}


def _require_safe_publication_parent(path: Path, repository_root: Path) -> None:
    """Reject publication paths whose repository-owned parent chain contains symlinks."""
    try:
        relative = path.relative_to(repository_root)
    except ValueError:
        _fail("open PR queue manifest path escaped the repository root")
    if len(relative.parts) < 2:
        _fail("open PR queue manifest path must have a repository-owned parent")

    current = repository_root
    for component in relative.parts[:-1]:
        current = current / component
        if current.is_symlink():
            _fail("open PR queue manifest parent must not contain symbolic links")
        if not current.is_dir():
            _fail("open PR queue manifest parent must be an existing directory")


def _write_manifest_atomic(manifest: dict[str, Any]) -> None:
    """Atomically replace the canonical manifest without following a symlink target."""
    _require_safe_publication_parent(MANIFEST_PATH, REPO_ROOT)
    if MANIFEST_PATH.is_symlink():
        _fail("open PR queue manifest path must not be a symbolic link")
    temporary = MANIFEST_PATH.with_name(f".{MANIFEST_PATH.name}.tmp")
    if temporary.exists() or temporary.is_symlink():
        _fail("temporary manifest path already exists")
    encoded = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, MANIFEST_PATH)
    finally:
        if temporary.exists():
            temporary.unlink()


def main() -> int:
    """Refresh the committed queue from GitHub and return a shell-friendly status code."""
    try:
        seed = load_manifest(MANIFEST_PATH)
        token = os.environ.get("GITHUB_TOKEN")
        live_result = collect_paginated_pulls(
            lambda page, size: fetch_live_pull_page(page, size, token)
        )
        base_tips = resolve_live_base_tips(live_result, token)
        base_sha = base_tips[BASE_BRANCH]
        snapshot_date = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
        refreshed = build_refreshed_manifest(
            seed,
            live_result,
            base_sha=base_sha,
            snapshot_date=snapshot_date,
            base_tips=base_tips,
        )
        _write_manifest_atomic(refreshed)
    except (ManifestError, RefreshError) as exc:
        print(f"open PR queue refresh failed: {exc}", file=sys.stderr)
        return 1
    print(
        f"open PR queue refreshed: {refreshed['open_pr_count']} PRs at {refreshed['base_sha']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
