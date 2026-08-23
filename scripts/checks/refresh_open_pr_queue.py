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


def _live_pr_entry(
    raw_pr: object,
    *,
    index: int,
    base_sha: str,
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

    base = _require_record(pr.get("base"), f"pull_requests[{index}].base")
    if base.get("ref") != BASE_BRANCH:
        _fail(f"pull_requests[{index}].base.ref must be {BASE_BRANCH}")
    pr_base_sha = _require_sha(base.get("sha"), f"pull_requests[{index}].base.sha")
    if pr_base_sha != base_sha:
        _fail(f"pull_requests[{index}].base.sha must match the live {BASE_BRANCH} tip")

    head = _require_record(pr.get("head"), f"pull_requests[{index}].head")
    head_sha = _require_sha(head.get("sha"), f"pull_requests[{index}].head.sha")

    prior = existing.get(number)
    if prior is None:
        initial_train = UNTRIAGED_TRAIN
        initial_disposition = "triage_required"
    else:
        initial_train = _require_text(prior.get("initial_train"), "existing.initial_train")
        initial_disposition = _require_text(
            prior.get("initial_disposition"), "existing.initial_disposition"
        )

    return {
        "number": number,
        "title": title,
        "url": expected_url,
        "initial_train": initial_train,
        "initial_disposition": initial_disposition,
        "head_sha": head_sha,
        "head_sha_status": "exact_current_head",
    }


def build_refreshed_manifest(
    seed: object,
    live_result: object,
    *,
    base_sha: str,
    snapshot_date: str,
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
            base_sha=normalized_base_sha,
            existing=existing,
        )
        number = int(entry["number"])
        if number in seen:
            _fail(f"duplicate pull request number: {number}")
        seen.add(number)
        refreshed_items.append(entry)
    refreshed_items.sort(key=lambda item: int(item["number"]))

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

    connection = http.client.HTTPSConnection(GITHUB_API_HOST, timeout=20)
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


def fetch_live_base_sha(token: str | None) -> str:
    """Resolve the current develop branch tip from the canonical GitHub API."""
    target = f"{REPOSITORY_API_PREFIX}branches/{BASE_BRANCH}"
    payload, _ = _request_github_json(target, token)
    branch = _require_record(payload, "branch")
    commit = _require_record(branch.get("commit"), "branch.commit")
    return _require_sha(commit.get("sha"), "branch.commit.sha")


def fetch_live_pull_page(
    page: int,
    page_size: int,
    token: str | None,
) -> tuple[list[dict[str, Any]], bool]:
    """Fetch one bounded page of open develop-targeted PRs from GitHub."""
    _require_positive_int(page, "page")
    _require_positive_int(page_size, "page_size")
    query = urllib.parse.urlencode(
        {
            "state": "open",
            "base": BASE_BRANCH,
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


def _write_manifest_atomic(manifest: dict[str, Any]) -> None:
    """Atomically replace the canonical manifest without following a symlink target."""
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
        base_sha = fetch_live_base_sha(token)
        live_result = collect_paginated_pulls(
            lambda page, size: fetch_live_pull_page(page, size, token)
        )
        snapshot_date = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
        refreshed = build_refreshed_manifest(
            seed,
            live_result,
            base_sha=base_sha,
            snapshot_date=snapshot_date,
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
