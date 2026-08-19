"""Audit GitHub Actions registry identities against one exact repository tree.

GitHub keeps workflow registry identities independently from workflow YAML. Deleting a
workflow file therefore does not prove that GitHub stopped advertising the identity.
This module provides a read-only, fail-closed audit bound to one immutable default-
branch tree. It never disables workflows; its JSON output is evidence for a separately
authorized operator or control-plane action.
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.parse
from collections import Counter
from datetime import UTC, datetime
from typing import Any, Callable

import urllib3

DEFAULT_API_URL = "https://api.github.com"
DEFAULT_BRANCH = "develop"
DEFAULT_PER_PAGE = 100
MAX_PAGES = 1000
KNOWN_NON_ACTIVE_WORKFLOW_STATES = frozenset(
    {
        "deleted",
        "disabled_fork",
        "disabled_inactivity",
        "disabled_manually",
    }
)
CLASSIFICATIONS = (
    "present",
    "orphaned_deleted",
    "disabled",
    "github_dynamic",
    "unresolved",
)


class AuditError(RuntimeError):
    """Raised when evidence is incomplete, inconsistent, or unsafe to classify."""


def _require_nonempty_string(value: object) -> str | None:
    """Return a non-empty string, or ``None`` for malformed external input."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _valid_workflow_id(value: object) -> bool:
    """Return whether *value* is a positive integer workflow id, excluding booleans."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _repository_workflow_path(path: str) -> bool:
    """Return whether *path* can name repository-owned workflow YAML."""
    return path.startswith(".github/workflows/") and path.endswith((".yml", ".yaml"))


def _github_dynamic_workflow_path(path: str) -> bool:
    """Return whether GitHub's registry path identifies a platform-managed workflow."""
    return path.startswith("dynamic/")


def classify_workflows(
    workflows: list[dict[str, Any]],
    tree_paths: set[str],
) -> list[dict[str, Any]]:
    """Classify registry entries using exact-tree path and registry-state evidence.

    Workflow names are intentionally ignored for lifecycle classification: a legitimate
    live workflow may contain words such as ``bootstrap`` or ``finalize``. Duplicate ids,
    malformed objects, and unknown lifecycle states fail closed as ``unresolved``.
    GitHub's live Actions registry exposes platform-managed workflows under ``dynamic/``
    paths, so that observed path namespace is the only dynamic-ownership discriminator
    accepted here; untrusted auxiliary fields cannot override repository path evidence.
    An active repository workflow absent from the bound default tree is also unresolved
    because that absence alone does not prove that no live non-default branch still owns
    the workflow source.
    """
    workflow_ids = [workflow.get("id") for workflow in workflows]
    duplicate_ids = {
        workflow_id
        for workflow_id, count in Counter(workflow_ids).items()
        if _valid_workflow_id(workflow_id) and count > 1
    }
    records: list[dict[str, Any]] = []

    for workflow in workflows:
        workflow_id = workflow.get("id")
        name = _require_nonempty_string(workflow.get("name"))
        path = _require_nonempty_string(workflow.get("path"))
        state = _require_nonempty_string(workflow.get("state"))

        if not _valid_workflow_id(workflow_id) or name is None or path is None or state is None:
            records.append(
                {
                    "workflow_id": workflow_id,
                    "name": name,
                    "path": path,
                    "state": state,
                    "classification": "unresolved",
                    "reason": "missing or invalid workflow id, name, path, or state",
                }
            )
            continue

        if workflow_id in duplicate_ids:
            classification = "unresolved"
            reason = "duplicate workflow id in registry snapshot"
        elif state in KNOWN_NON_ACTIVE_WORKFLOW_STATES:
            classification = "disabled"
            reason = "registry state is not active"
        elif state != "active":
            classification = "unresolved"
            reason = "unknown workflow registry state"
        elif _github_dynamic_workflow_path(path):
            classification = "github_dynamic"
            reason = "workflow path identifies a GitHub-managed dynamic identity"
        elif not _repository_workflow_path(path):
            classification = "unresolved"
            reason = "active registry path is not repository workflow YAML"
        elif path in tree_paths:
            classification = "present"
            reason = "active registry path exists at the bound tree"
        else:
            classification = "unresolved"
            reason = (
                "active registry path is absent from the bound default tree; "
                "branch provenance is unproven"
            )

        records.append(
            {
                "workflow_id": workflow_id,
                "name": name,
                "path": path,
                "state": state,
                "classification": classification,
                "reason": reason,
            }
        )

    return records


def _workflow_identity_snapshot(workflows: list[dict[str, Any]]) -> list[str]:
    """Return an order-independent canonical multiset of classification input fields."""
    identities = [
        json.dumps(
            [
                workflow.get("id"),
                workflow.get("path"),
                workflow.get("state"),
                workflow.get("name"),
            ],
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        )
        for workflow in workflows
    ]
    identities.sort()
    return identities


def collect_paginated_workflows(
    fetch_page: Callable[[int, int], tuple[dict[str, Any], dict[str, Any]]],
    *,
    per_page: int = DEFAULT_PER_PAGE,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Collect the complete registry while retaining a successful receipt for each page."""
    if not isinstance(per_page, int) or isinstance(per_page, bool) or not 1 <= per_page <= 100:
        raise AuditError("per_page must be an integer from 1 through 100")

    workflows: list[dict[str, Any]] = []
    receipts: list[dict[str, Any]] = []
    expected_total: int | None = None

    for page in range(1, MAX_PAGES + 1):
        payload, receipt = fetch_page(page, per_page)
        total_count = payload.get("total_count")
        page_workflows = payload.get("workflows")
        if (
            not isinstance(total_count, int)
            or isinstance(total_count, bool)
            or total_count < 0
            or not isinstance(page_workflows, list)
            or not all(isinstance(item, dict) for item in page_workflows)
        ):
            raise AuditError("workflow page has malformed total_count or workflows")

        if expected_total is None:
            expected_total = total_count
        elif total_count != expected_total:
            raise AuditError("total_count changed during pagination")

        if not isinstance(receipt, dict) or receipt.get("status") != 200:
            raise AuditError("workflow page receipt is missing a successful HTTP status")
        if receipt.get("page") != page or receipt.get("item_count") != len(page_workflows):
            raise AuditError("workflow page receipt does not match the fetched page")

        workflows.extend(page_workflows)
        receipts.append(dict(receipt))
        if len(workflows) == expected_total:
            return workflows, receipts
        if len(workflows) > expected_total:
            raise AuditError("pagination returned more workflows than total_count")
        if not page_workflows:
            raise AuditError("pagination ended before total_count")

    raise AuditError("workflow pagination exceeded the safety page limit")


class GitHubRegistryClient:
    """Minimal read-only GitHub REST client with a fixed verified HTTPS origin."""

    def __init__(
        self,
        *,
        api_url: str = DEFAULT_API_URL,
        token: str | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        """Create a client without ever logging or returning the bearer token."""
        parsed = urllib.parse.urlparse(api_url)
        try:
            parsed_port = parsed.port
        except ValueError as error:
            raise AuditError("api_url contains an invalid port") from error
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise AuditError("api_url must be an absolute HTTPS URL without credentials/query/fragment")
        if timeout_seconds <= 0:
            raise AuditError("timeout_seconds must be positive")

        self._api_url = api_url.rstrip("/")
        self._host = parsed.hostname
        self._port = parsed_port
        self._base_path = parsed.path.rstrip("/")
        self._token = token
        self._timeout_seconds = timeout_seconds

    def _request_target(self, url: str) -> str:
        """Return a path/query only when *url* remains on the configured HTTPS origin."""
        parsed = urllib.parse.urlparse(url)
        try:
            candidate_port = parsed.port or 443 if parsed.scheme == "https" else None
        except ValueError as error:
            raise AuditError("request target contains an invalid port") from error
        configured_port = self._port or 443
        path_matches_base = (
            not self._base_path
            or parsed.path == self._base_path
            or parsed.path.startswith(f"{self._base_path}/")
        )
        if (
            parsed.scheme != "https"
            or parsed.hostname != self._host
            or candidate_port != configured_port
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
            or not path_matches_base
        ):
            raise AuditError("request target must stay on the configured HTTPS API origin")

        target = parsed.path or "/"
        if parsed.query:
            target = f"{target}?{parsed.query}"
        return target

    def _get_json(self, url: str) -> tuple[dict[str, Any], int]:
        """Fetch one JSON object through a verified fixed-origin pool with redirects off."""
        target = self._request_target(url)
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "bandscope-workflow-registry-audit/1",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"

        pool = urllib3.HTTPSConnectionPool(
            self._host,
            port=self._port,
            cert_reqs=ssl.CERT_REQUIRED,
            assert_hostname=self._host,
        )
        try:
            response = pool.request(
                "GET",
                target,
                headers=headers,
                redirect=False,
                retries=False,
                timeout=urllib3.Timeout(total=self._timeout_seconds),
            )
            status = int(response.status)
            body = bytes(response.data)
        except (urllib3.exceptions.HTTPError, TimeoutError, OSError) as error:
            raise AuditError("GitHub API request failed before complete evidence was received") from error
        finally:
            pool.close()

        if status != 200:
            raise AuditError(f"GitHub API request returned unexpected HTTP {status}")
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AuditError("GitHub API returned malformed UTF-8 JSON") from error
        if not isinstance(payload, dict):
            raise AuditError("GitHub API returned a non-object JSON payload")
        return payload, status

    @staticmethod
    def _repository_path(repository: str) -> str:
        """Validate and encode an ``owner/name`` repository identifier."""
        parts = repository.split("/")
        if len(parts) != 2 or not all(part and part not in {".", ".."} for part in parts):
            raise AuditError("repository must use owner/name form")
        return "/".join(urllib.parse.quote(part, safe="") for part in parts)

    def fetch_ref_sha(self, repository: str, branch: str) -> str:
        """Return the exact commit currently named by *branch*."""
        repository_path = self._repository_path(repository)
        branch_path = urllib.parse.quote(branch, safe="")
        payload, _status = self._get_json(
            f"{self._api_url}/repos/{repository_path}/git/ref/heads/{branch_path}"
        )
        object_payload = payload.get("object")
        sha = object_payload.get("sha") if isinstance(object_payload, dict) else None
        if not isinstance(sha, str) or len(sha) != 40 or any(
            character not in "0123456789abcdefABCDEF" for character in sha
        ):
            raise AuditError("branch ref response did not contain a full commit SHA")
        return sha.lower()

    def fetch_workflows(
        self,
        repository: str,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Return all workflow records plus pagination receipts."""
        repository_path = self._repository_path(repository)

        def fetch_page(page: int, per_page: int) -> tuple[dict[str, Any], dict[str, Any]]:
            url = (
                f"{self._api_url}/repos/{repository_path}/actions/workflows"
                f"?per_page={per_page}&page={page}"
            )
            payload, status = self._get_json(url)
            page_workflows = payload.get("workflows")
            item_count = len(page_workflows) if isinstance(page_workflows, list) else -1
            return payload, {
                "page": page,
                "url": url,
                "status": status,
                "item_count": item_count,
            }

        return collect_paginated_workflows(fetch_page)

    def fetch_tree_paths(self, repository: str, sha: str) -> set[str]:
        """Return every path from a complete recursive tree bound to *sha*."""
        repository_path = self._repository_path(repository)
        payload, _status = self._get_json(
            f"{self._api_url}/repos/{repository_path}/git/trees/{sha}?recursive=1"
        )
        if payload.get("truncated") is not False:
            raise AuditError("recursive tree response was truncated")
        tree = payload.get("tree")
        if not isinstance(tree, list):
            raise AuditError("recursive tree response is missing the tree array")

        paths: set[str] = set()
        for entry in tree:
            if not isinstance(entry, dict):
                raise AuditError("recursive tree contains a malformed entry")
            path = _require_nonempty_string(entry.get("path"))
            if path is None:
                raise AuditError("recursive tree entry is missing a valid path")
            paths.add(path)
        return paths


def audit_repository(
    client: Any,
    *,
    repository: str,
    branch: str,
    observed_at: str | None = None,
) -> dict[str, Any]:
    """Audit one repository while proving the bound branch and registry did not move."""
    started_sha = client.fetch_ref_sha(repository, branch)
    initial_workflows, _initial_receipts = client.fetch_workflows(repository)
    tree_paths = client.fetch_tree_paths(repository, started_sha)
    workflows, receipts = client.fetch_workflows(repository)
    finished_sha = client.fetch_ref_sha(repository, branch)
    if finished_sha != started_sha:
        raise AuditError("default branch moved during audit")
    if _workflow_identity_snapshot(initial_workflows) != _workflow_identity_snapshot(workflows):
        raise AuditError("workflow registry changed during audit")

    records = classify_workflows(workflows, tree_paths)
    records.sort(key=lambda record: (str(record.get("workflow_id")), str(record.get("path"))))
    counts = Counter(record["classification"] for record in records)
    summary = {classification: counts.get(classification, 0) for classification in CLASSIFICATIONS}

    return {
        "schema_version": "bandscope.workflow-registry-audit.v1",
        "repository": repository,
        "branch": branch,
        "bound_ref_sha": started_sha,
        "observed_at": observed_at or datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "pagination_receipts": receipts,
        "summary": summary,
        "workflows": records,
    }


def _build_parser() -> argparse.ArgumentParser:
    """Build the bounded command-line interface for operator evidence collection."""
    parser = argparse.ArgumentParser(
        description="Read-only audit of GitHub Actions registry identities against an exact tree."
    )
    parser.add_argument(
        "--repository",
        default=os.environ.get("GITHUB_REPOSITORY"),
        help="GitHub repository in owner/name form (defaults to GITHUB_REPOSITORY).",
    )
    parser.add_argument(
        "--branch",
        default=DEFAULT_BRANCH,
        help=f"Protected branch to bind (default: {DEFAULT_BRANCH}).",
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help="GitHub REST API base URL; HTTPS only.",
    )
    parser.add_argument(
        "--token-env",
        default="GITHUB_TOKEN",
        help="Environment variable containing a read-only token; its value is never printed.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Emit exact JSON evidence; return nonzero for orphans, unresolved data, or audit failure."""
    args = _build_parser().parse_args(argv)
    if not args.repository:
        print(
            "workflow registry audit failed: --repository or GITHUB_REPOSITORY is required",
            file=sys.stderr,
        )
        return 2

    token = os.environ.get(args.token_env) if args.token_env else None
    try:
        client = GitHubRegistryClient(api_url=args.api_url, token=token)
        report = audit_repository(client, repository=args.repository, branch=args.branch)
    except AuditError as error:
        print(f"workflow registry audit failed: {error}", file=sys.stderr)
        return 2

    print(json.dumps(report, indent=2, sort_keys=True))
    if report["summary"]["orphaned_deleted"] or report["summary"]["unresolved"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
