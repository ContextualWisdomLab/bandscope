#!/usr/bin/env python3
"""Collect exact-head PR readiness receipts from bounded live GitHub authority."""

from __future__ import annotations

import argparse
import http.client
import json
import os
import tempfile
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from verify_open_pr_queue import ManifestError, load_manifest, validate_manifest

REPOSITORY = "ContextualWisdomLab/bandscope"
REPOSITORY_OWNER = "ContextualWisdomLab"
REPOSITORY_NAME = "bandscope"
GITHUB_API_HOST = "api.github.com"
REPOSITORY_API_PREFIX = f"/repos/{REPOSITORY}/"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST_PATH = Path("docs/product-readiness/open-pr-queue.json")
DEFAULT_OUTPUT_PATH = Path("docs/product-readiness/open-pr-readiness.json")
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
MAX_OPEN_PRS = 1000
GRAPHQL_BATCH_SIZE = 20
MAX_STATUS_CONTEXTS = 100
MAX_REVIEWS = 100
MAX_REVIEW_THREADS = 100
PASSING_CHECK_CONCLUSIONS = frozenset({"SUCCESS"})
PASSING_STATUS_STATES = frozenset({"SUCCESS"})


class ReadinessError(ValueError):
    """Raised when readiness evidence is missing, stale, incomplete, or malformed."""


def _fail(message: str) -> None:
    raise ReadinessError(message)


def _record(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(f"{field} must be an object")
    return value


def _list(value: object, field: str) -> list[Any]:
    if not isinstance(value, list):
        _fail(f"{field} must be an array")
    return value


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        _fail(f"{field} must be a non-empty trim-stable string")
    return value


def _positive_int(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        _fail(f"{field} must be a positive integer")
    return value


def _nullable_positive_int(value: object, field: str) -> int | None:
    if value is None:
        return None
    return _positive_int(value, field)


def _request_json(
    method: str,
    target: str,
    token: str,
    *,
    body: object | None = None,
) -> object:
    if not token:
        _fail("GITHUB_TOKEN is required for complete live readiness evidence")
    if method == "GET":
        if not target.startswith(REPOSITORY_API_PREFIX):
            _fail("GitHub REST target escaped the canonical repository")
    elif method == "POST":
        if target != "/graphql":
            _fail("GitHub POST target must be the canonical GraphQL endpoint")
    else:
        _fail("unsupported GitHub request method")

    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bandscope-open-pr-readiness",
        "Authorization": f"Bearer {token}",
    }
    encoded_body: bytes | None = None
    if body is not None:
        encoded_body = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"

    connection = http.client.HTTPSConnection(GITHUB_API_HOST, timeout=20)
    try:
        connection.request(method, target, body=encoded_body, headers=headers)
        response = connection.getresponse()
        if response.status != 200:
            _fail(f"GitHub API request failed with HTTP status {response.status}")
        encoded = response.read(MAX_RESPONSE_BYTES + 1)
        if len(encoded) > MAX_RESPONSE_BYTES:
            _fail("GitHub API response exceeded the bounded response size")
        payload = json.loads(encoded.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError, http.client.HTTPException) as exc:
        raise ReadinessError(f"GitHub API request failed: {type(exc).__name__}") from exc
    finally:
        connection.close()

    if isinstance(payload, dict) and payload.get("errors"):
        errors = _list(payload["errors"], "GraphQL errors")
        first = _record(errors[0], "GraphQL errors[0]") if errors else {}
        message = first.get("message", "unknown GraphQL error")
        _fail(f"GitHub GraphQL request failed: {message}")
    return payload


def fetch_base_policy(branch_ref: str, expected_sha: str, token: str) -> dict[str, object]:
    """Resolve the target branch again and capture its effective required-check policy."""
    normalized_ref = _text(branch_ref, "base_ref")
    encoded_ref = urllib.parse.quote(normalized_ref, safe="")
    payload = _record(
        _request_json("GET", f"{REPOSITORY_API_PREFIX}branches/{encoded_ref}", token),
        f"branch {normalized_ref}",
    )
    commit = _record(payload.get("commit"), f"branch {normalized_ref}.commit")
    live_sha = _text(commit.get("sha"), f"branch {normalized_ref}.commit.sha").lower()
    if live_sha != expected_sha.lower():
        _fail(f"base branch moved during readiness capture: {normalized_ref}")

    protected = payload.get("protected")
    if not isinstance(protected, bool):
        _fail(f"branch {normalized_ref}.protected must be boolean")

    required: list[dict[str, object]] = []
    if protected:
        protection = _record(payload.get("protection"), f"branch {normalized_ref}.protection")
        status_checks = protection.get("required_status_checks")
        if status_checks is not None:
            status_record = _record(
                status_checks, f"branch {normalized_ref}.protection.required_status_checks"
            )
            checks = status_record.get("checks")
            if checks is not None:
                for index, raw_check in enumerate(
                    _list(checks, f"branch {normalized_ref}.required checks")
                ):
                    check = _record(raw_check, f"branch {normalized_ref}.required checks[{index}]")
                    context = _text(
                        check.get("context"),
                        f"branch {normalized_ref}.required checks[{index}].context",
                    )
                    app_id = _nullable_positive_int(
                        check.get("app_id"),
                        f"branch {normalized_ref}.required checks[{index}].app_id",
                    )
                    required.append({"context": context, "app_id": app_id})
            else:
                for index, raw_context in enumerate(
                    _list(status_record.get("contexts", []), f"branch {normalized_ref}.contexts")
                ):
                    required.append(
                        {
                            "context": _text(
                                raw_context, f"branch {normalized_ref}.contexts[{index}]"
                            ),
                            "app_id": None,
                        }
                    )
    required.sort(key=lambda item: (str(item["context"]), int(item["app_id"] or 0)))
    return {
        "base_ref": normalized_ref,
        "base_sha": live_sha,
        "protected": protected,
        "required_checks": required,
    }


def _graphql_batch_query(numbers: list[int]) -> str:
    if not numbers or len(numbers) > GRAPHQL_BATCH_SIZE:
        _fail("GraphQL batch size is outside the reviewed bound")
    aliases: list[str] = []
    for number in numbers:
        _positive_int(number, "pull request number")
        aliases.append(
            f"""
    p{number}: pullRequest(number: {number}) {{
      number
      headRefOid
      author {{ login }}
      reviewThreads(first: {MAX_REVIEW_THREADS}) {{
        pageInfo {{ hasNextPage }}
        nodes {{ isResolved isOutdated }}
      }}
      reviews(last: {MAX_REVIEWS}) {{
        pageInfo {{ hasPreviousPage }}
        nodes {{
          state
          submittedAt
          author {{ login }}
          commit {{ oid }}
        }}
      }}
      commits(last: 1) {{
        nodes {{
          commit {{
            oid
            statusCheckRollup {{
              contexts(first: {MAX_STATUS_CONTEXTS}) {{
                pageInfo {{ hasNextPage }}
                nodes {{
                  __typename
                  ... on CheckRun {{
                    name
                    status
                    conclusion
                    app {{ databaseId }}
                  }}
                  ... on StatusContext {{
                    context
                    state
                  }}
                }}
              }}
            }}
          }}
        }}
      }}
    }}"""
        )
    joined = "\n".join(aliases)
    return f"""query BandScopeReadiness {{
  repository(owner: \"{REPOSITORY_OWNER}\", name: \"{REPOSITORY_NAME}\") {{
{joined}
  }}
}}"""


def fetch_pr_batch(numbers: list[int], token: str) -> dict[int, dict[str, Any]]:
    """Fetch checks, reviews and thread state for a bounded PR batch in one GraphQL request."""
    payload = _record(
        _request_json(
            "POST",
            "/graphql",
            token,
            body={"query": _graphql_batch_query(numbers)},
        ),
        "GraphQL response",
    )
    data = _record(payload.get("data"), "GraphQL response.data")
    repository = _record(data.get("repository"), "GraphQL response.data.repository")
    result: dict[int, dict[str, Any]] = {}
    for number in numbers:
        node = repository.get(f"p{number}")
        if node is None:
            _fail(f"pull request {number} disappeared during readiness capture")
        result[number] = _record(node, f"pull request {number}")
    return result


def _normalize_check_contexts(pr_node: dict[str, Any], expected_head: str) -> list[dict[str, object]]:
    commits = _record(pr_node.get("commits"), "pull request commits")
    commit_nodes = _list(commits.get("nodes"), "pull request commits.nodes")
    if len(commit_nodes) != 1:
        _fail("pull request must expose exactly one latest commit node")
    pr_commit = _record(commit_nodes[0], "pull request latest commit")
    commit = _record(pr_commit.get("commit"), "pull request latest commit.commit")
    observed_head = _text(commit.get("oid"), "pull request latest commit oid").lower()
    if observed_head != expected_head.lower():
        _fail("status rollup commit does not match the exact current head")

    rollup = commit.get("statusCheckRollup")
    if rollup is None:
        return []
    rollup_record = _record(rollup, "statusCheckRollup")
    contexts = _record(rollup_record.get("contexts"), "statusCheckRollup.contexts")
    page_info = _record(contexts.get("pageInfo"), "statusCheckRollup.contexts.pageInfo")
    if page_info.get("hasNextPage") is not False:
        _fail("status-check context pagination bound would truncate readiness evidence")

    normalized: list[dict[str, object]] = []
    for index, raw_context in enumerate(
        _list(contexts.get("nodes"), "statusCheckRollup.contexts.nodes")
    ):
        context = _record(raw_context, f"status context[{index}]")
        typename = context.get("__typename")
        if typename == "CheckRun":
            app = context.get("app")
            app_id: int | None = None
            if app is not None:
                app_id = _nullable_positive_int(
                    _record(app, f"status context[{index}].app").get("databaseId"),
                    f"status context[{index}].app.databaseId",
                )
            normalized.append(
                {
                    "context": _text(context.get("name"), f"status context[{index}].name"),
                    "app_id": app_id,
                    "passing": (
                        context.get("status") == "COMPLETED"
                        and context.get("conclusion") in PASSING_CHECK_CONCLUSIONS
                    ),
                }
            )
        elif typename == "StatusContext":
            normalized.append(
                {
                    "context": _text(context.get("context"), f"status context[{index}].context"),
                    "app_id": None,
                    "passing": context.get("state") in PASSING_STATUS_STATES,
                }
            )
        else:
            _fail(f"unsupported status context type: {typename}")
    return normalized


def evaluate_required_checks(
    policy: dict[str, object],
    observed_contexts: list[dict[str, object]],
) -> tuple[str, list[str]]:
    """Return a fail-closed required-check state and exact non-passing identities."""
    if policy.get("protected") is not True:
        return "unprotected_base", []
    required = _list(policy.get("required_checks"), "required_checks")
    if not required:
        return "no_required_checks", []

    failures: list[str] = []
    for index, raw_required in enumerate(required):
        required_check = _record(raw_required, f"required_checks[{index}]")
        context = _text(required_check.get("context"), f"required_checks[{index}].context")
        app_id = _nullable_positive_int(
            required_check.get("app_id"), f"required_checks[{index}].app_id"
        )
        matching = [
            item
            for item in observed_contexts
            if item.get("context") == context
            and (app_id is None or item.get("app_id") == app_id)
        ]
        if not matching or not any(item.get("passing") is True for item in matching):
            failures.append(f"{context}@{app_id}" if app_id is not None else context)
    return ("passing" if not failures else "non_passing", sorted(failures))


def derive_review_state(
    pr_node: dict[str, Any],
    *,
    expected_head: str,
    pr_author: str,
) -> tuple[str, str | None, int]:
    """Evaluate only independent review submissions explicitly tied to the exact head."""
    reviews = _record(pr_node.get("reviews"), "pull request reviews")
    page_info = _record(reviews.get("pageInfo"), "pull request reviews.pageInfo")
    if page_info.get("hasPreviousPage") is not False:
        _fail("review pagination bound would truncate readiness evidence")

    approvals = 0
    changes_requested = 0
    for index, raw_review in enumerate(_list(reviews.get("nodes"), "pull request reviews.nodes")):
        review = _record(raw_review, f"review[{index}]")
        author = review.get("author")
        if author is None:
            continue
        login = _text(_record(author, f"review[{index}].author").get("login"), f"review[{index}].author.login")
        if login == pr_author:
            continue
        commit = review.get("commit")
        if commit is None:
            continue
        reviewed_sha = _text(
            _record(commit, f"review[{index}].commit").get("oid"),
            f"review[{index}].commit.oid",
        ).lower()
        if reviewed_sha != expected_head.lower():
            continue
        state = review.get("state")
        if state == "APPROVED":
            approvals += 1
        elif state == "CHANGES_REQUESTED":
            changes_requested += 1

    if changes_requested:
        return "changes_requested", expected_head.lower(), approvals
    if approvals:
        return "approved", expected_head.lower(), approvals
    return "review_required", None, 0


def unresolved_actionable_thread_count(pr_node: dict[str, Any]) -> int:
    """Count unresolved, non-outdated review threads without treating old code as current action."""
    threads = _record(pr_node.get("reviewThreads"), "reviewThreads")
    page_info = _record(threads.get("pageInfo"), "reviewThreads.pageInfo")
    if page_info.get("hasNextPage") is not False:
        _fail("review-thread pagination bound would truncate readiness evidence")
    count = 0
    for index, raw_thread in enumerate(_list(threads.get("nodes"), "reviewThreads.nodes")):
        thread = _record(raw_thread, f"reviewThread[{index}]")
        resolved = thread.get("isResolved")
        outdated = thread.get("isOutdated")
        if not isinstance(resolved, bool) or not isinstance(outdated, bool):
            _fail(f"reviewThread[{index}] resolution fields must be boolean")
        if not resolved and not outdated:
            count += 1
    return count


def _decision_metadata(queue_entry: dict[str, Any], trains: dict[str, Any]) -> dict[str, object]:
    train_name = _text(queue_entry.get("initial_train"), "initial_train")
    train = _record(trains.get(train_name), f"trains.{train_name}")
    owner_issue = _positive_int(train.get("issue"), f"trains.{train_name}.issue")
    rationale = _text(queue_entry.get("initial_disposition"), "initial_disposition")
    # The queue seed did not historically record a reviewed decision timestamp. Do not
    # manufacture one from PR updated_at or snapshot_date; keep the receipt non-passing.
    return {
        "decision_owner": f"issue:#{owner_issue}",
        "decision_rationale": rationale,
        "decision_timestamp": None,
        "decision_metadata_state": "timestamp_required",
    }


def build_receipt(
    queue_entry: dict[str, Any],
    *,
    policy: dict[str, object],
    pr_node: dict[str, Any],
    trains: dict[str, Any],
    captured_at: str,
) -> dict[str, object]:
    number = _positive_int(queue_entry.get("number"), "queue entry number")
    expected_head = _text(queue_entry.get("head_sha"), f"PR {number} head_sha").lower()
    if pr_node.get("number") != number:
        _fail(f"GraphQL PR identity mismatch for {number}")
    graphql_head = _text(pr_node.get("headRefOid"), f"PR {number} headRefOid").lower()
    if graphql_head != expected_head:
        _fail(f"pull request {number} moved during readiness capture")

    author = _record(pr_node.get("author"), f"PR {number} author")
    pr_author = _text(author.get("login"), f"PR {number} author.login")
    observed_contexts = _normalize_check_contexts(pr_node, expected_head)
    required_check_state, non_passing_checks = evaluate_required_checks(policy, observed_contexts)
    review_decision, reviewed_sha, approval_count = derive_review_state(
        pr_node, expected_head=expected_head, pr_author=pr_author
    )
    thread_count = unresolved_actionable_thread_count(pr_node)
    decision = _decision_metadata(queue_entry, trains)

    ready = (
        queue_entry.get("draft") is False
        and required_check_state == "passing"
        and review_decision == "approved"
        and thread_count == 0
        and decision["decision_metadata_state"] == "complete"
    )
    return {
        "number": number,
        "head_sha": expected_head,
        "base_ref": _text(queue_entry.get("base_ref"), f"PR {number} base_ref"),
        "base_sha": _text(queue_entry.get("base_sha"), f"PR {number} base_sha").lower(),
        "draft": bool(queue_entry.get("draft")),
        "required_check_state": required_check_state,
        "non_passing_required_checks": non_passing_checks,
        "review_decision": review_decision,
        "reviewed_sha": reviewed_sha,
        "current_head_approval_count": approval_count,
        "unresolved_actionable_thread_count": thread_count,
        **decision,
        "captured_at": captured_at,
        "receipt_state": "passing" if ready else "non_passing",
    }


def validate_readiness_document(document: object) -> None:
    root = _record(document, "readiness")
    if root.get("schema_version") != "1.0.0":
        _fail("readiness.schema_version must be 1.0.0")
    if root.get("repository") != REPOSITORY:
        _fail(f"readiness.repository must be {REPOSITORY}")
    captured_at = _text(root.get("captured_at"), "readiness.captured_at")
    try:
        datetime.strptime(captured_at, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as exc:
        raise ReadinessError("readiness.captured_at must use YYYY-MM-DDTHH:MM:SSZ") from exc

    receipts = _list(root.get("receipts"), "readiness.receipts")
    open_pr_count = root.get("open_pr_count")
    if isinstance(open_pr_count, bool) or not isinstance(open_pr_count, int):
        _fail("readiness.open_pr_count must be an integer")
    if open_pr_count != len(receipts):
        _fail("readiness.open_pr_count must equal receipts length")

    seen: set[int] = set()
    for index, raw_receipt in enumerate(receipts):
        receipt = _record(raw_receipt, f"readiness.receipts[{index}]")
        number = _positive_int(receipt.get("number"), f"readiness.receipts[{index}].number")
        if number in seen:
            _fail(f"duplicate readiness receipt: {number}")
        seen.add(number)
        _text(receipt.get("head_sha"), f"readiness.receipts[{index}].head_sha")
        if receipt.get("required_check_state") not in {
            "passing", "non_passing", "unprotected_base", "no_required_checks"
        }:
            _fail(f"readiness.receipts[{index}].required_check_state is unsupported")
        if receipt.get("review_decision") not in {
            "approved", "changes_requested", "review_required"
        }:
            _fail(f"readiness.receipts[{index}].review_decision is unsupported")
        thread_count = receipt.get("unresolved_actionable_thread_count")
        if isinstance(thread_count, bool) or not isinstance(thread_count, int) or thread_count < 0:
            _fail(f"readiness.receipts[{index}].unresolved_actionable_thread_count must be non-negative")
        if receipt.get("decision_metadata_state") not in {"complete", "timestamp_required"}:
            _fail(f"readiness.receipts[{index}].decision_metadata_state is unsupported")
        if receipt.get("receipt_state") == "passing":
            if (
                receipt.get("required_check_state") != "passing"
                or receipt.get("review_decision") != "approved"
                or thread_count != 0
                or receipt.get("decision_metadata_state") != "complete"
                or receipt.get("draft") is not False
            ):
                _fail(f"readiness receipt {number} is a false-green")


def build_document(manifest: object, token: str) -> dict[str, object]:
    try:
        validate_manifest(manifest)
    except ManifestError as exc:
        raise ReadinessError(f"queue manifest is invalid: {exc}") from exc
    queue = _record(manifest, "queue manifest")
    entries = _list(queue.get("pull_requests"), "queue pull_requests")
    if len(entries) > MAX_OPEN_PRS:
        _fail("open PR count exceeds the reviewed readiness bound")
    trains = _record(queue.get("trains"), "queue trains")

    policies: dict[str, dict[str, object]] = {}
    for raw_entry in entries:
        entry = _record(raw_entry, "queue entry")
        base_ref = _text(entry.get("base_ref"), "queue entry base_ref")
        base_sha = _text(entry.get("base_sha"), "queue entry base_sha").lower()
        prior = policies.get(base_ref)
        if prior is None:
            policies[base_ref] = fetch_base_policy(base_ref, base_sha, token)
        elif prior.get("base_sha") != base_sha:
            _fail(f"queue contains inconsistent live target tips for {base_ref}")

    by_number: dict[int, dict[str, Any]] = {}
    numbers = [_positive_int(_record(item, "queue entry").get("number"), "queue entry number") for item in entries]
    for start in range(0, len(numbers), GRAPHQL_BATCH_SIZE):
        batch = numbers[start : start + GRAPHQL_BATCH_SIZE]
        by_number.update(fetch_pr_batch(batch, token))

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    receipts: list[dict[str, object]] = []
    for raw_entry in entries:
        entry = _record(raw_entry, "queue entry")
        number = _positive_int(entry.get("number"), "queue entry number")
        base_ref = _text(entry.get("base_ref"), f"PR {number} base_ref")
        receipts.append(
            build_receipt(
                entry,
                policy=policies[base_ref],
                pr_node=by_number[number],
                trains=trains,
                captured_at=captured_at,
            )
        )

    document: dict[str, object] = {
        "schema_version": "1.0.0",
        "repository": REPOSITORY,
        "captured_at": captured_at,
        "open_pr_count": len(receipts),
        "receipts": receipts,
    }
    validate_readiness_document(document)
    return document


def write_atomic(
    document: dict[str, object],
    path: Path,
    *,
    repository_root: Path = REPO_ROOT,
) -> None:
    """Publish the receipt inside a repository-owned, non-symlink parent chain."""
    root = repository_root.absolute()
    candidate = path if path.is_absolute() else root / path
    try:
        relative = candidate.relative_to(root)
    except ValueError:
        _fail("readiness output path escaped the repository root")
    if len(relative.parts) < 2:
        _fail("readiness output path must have a repository-owned parent")

    current = root
    for component in relative.parts[:-1]:
        current = current / component
        if current.is_symlink():
            _fail("readiness output parent must not contain symbolic links")
        if not current.is_dir():
            _fail("readiness output parent must be an existing directory")
    if candidate.is_symlink():
        _fail("readiness output path must not be a symbolic link")

    encoded = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{candidate.name}.", suffix=".tmp", dir=current
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, candidate)
    finally:
        if temporary.exists():
            temporary.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = load_manifest(args.manifest)
        document = build_document(manifest, os.environ.get("GITHUB_TOKEN", ""))
        write_atomic(document, args.output)
    except (ManifestError, ReadinessError) as exc:
        print(f"open PR readiness collection failed: {exc}", file=os.sys.stderr)
        return 1
    print(f"open PR readiness collected: {document['open_pr_count']} exact-head receipts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
