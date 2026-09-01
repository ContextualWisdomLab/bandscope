"""Regression tests for live BandScope open pull-request queue refresh."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
REFRESHER_PATH = REPO_ROOT / "scripts" / "checks" / "refresh_open_pr_queue.py"


def _load_refresher() -> ModuleType:
    """Load the operator refresher without requiring scripts to be a Python package."""
    sys.path.insert(0, str(REFRESHER_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location("refresh_open_pr_queue", REFRESHER_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _seed() -> dict[str, object]:
    """Return the smallest representative queue seed used by live refresh tests."""
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-08-20",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": "a" * 40,
        "open_pr_count": 1,
        "authority_note": "Refresh exact live evidence before action.",
        "trains": {"T0": {"description": "Dependency base", "issue": 966}},
        "pull_requests": [
            {
                "number": 783,
                "title": "old title",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/783",
                "initial_train": "T0",
                "initial_disposition": "canonical_dependency_security_base",
                "head_sha": None,
                "head_sha_status": "refresh_required_before_action",
            }
        ],
    }


def _seed_with_predecessor() -> dict[str, object]:
    """Return reviewed routing with one explicit dependency edge."""
    seed = _seed()
    pull_requests = seed["pull_requests"]
    assert isinstance(pull_requests, list)
    pull_requests[0]["predecessor_prs"] = [700]
    pull_requests.append(
        {
            "number": 700,
            "title": "toolchain root",
            "url": "https://github.com/ContextualWisdomLab/bandscope/pull/700",
            "initial_train": "T0",
            "initial_disposition": "triage_required",
            "head_sha": "7" * 40,
            "head_sha_status": "exact_current_head",
            "predecessor_prs": [],
        }
    )
    seed["open_pr_count"] = 2
    return seed


def _live_pr(
    number: int,
    head_sha: str,
    *,
    base_ref: str = "develop",
    base_sha: str | None = "d" * 40,
    title: str | None = None,
    draft: bool = False,
    updated_at: str = "2026-09-01T12:34:56Z",
) -> dict[str, object]:
    """Return a minimal GitHub pulls-API record for one open PR."""
    base: dict[str, object] = {"ref": base_ref}
    if base_sha is not None:
        base["sha"] = base_sha
    return {
        "number": number,
        "title": title or f"PR {number}",
        "html_url": f"https://github.com/ContextualWisdomLab/bandscope/pull/{number}",
        "state": "open",
        "draft": draft,
        "updated_at": updated_at,
        "base": base,
        "head": {"sha": head_sha},
    }


def test_collect_paginated_pulls_consumes_every_announced_page() -> None:
    """The collector follows every announced next page before declaring completeness."""
    refresher = _load_refresher()
    pages = {
        1: ([_live_pr(1, "1" * 40), _live_pr(2, "2" * 40)], True),
        2: ([_live_pr(3, "3" * 40)], False),
    }

    result = refresher.collect_paginated_pulls(
        lambda page, size: pages[page], page_size=2, max_pages=3
    )

    assert [item["number"] for item in result["pull_requests"]] == [1, 2, 3]
    assert result["incomplete_results"] is False


def test_collect_paginated_pulls_fails_closed_when_bound_would_truncate() -> None:
    """A pagination bound must fail instead of publishing a success-shaped partial queue."""
    refresher = _load_refresher()

    with pytest.raises(refresher.RefreshError, match="pagination bound"):
        refresher.collect_paginated_pulls(
            lambda page, size: ([_live_pr(page, f"{page:x}".rjust(40, "0"))], True),
            page_size=1,
            max_pages=2,
        )


def test_refresh_manifest_updates_exact_heads_and_adds_untriaged_live_prs() -> None:
    """Live refresh preserves reviewed routing while recording every current open PR head."""
    refresher = _load_refresher()
    live = {
        "incomplete_results": False,
        "pull_requests": [
            _live_pr(
                783,
                "b" * 40,
                title="current dependency title",
                draft=True,
                updated_at="2026-09-01T23:45:01Z",
            ),
            _live_pr(1002, "c" * 40),
        ],
    }

    refreshed = refresher.build_refreshed_manifest(
        _seed(), live, base_sha="d" * 40, snapshot_date="2026-08-24"
    )

    assert refreshed["open_pr_count"] == 2
    assert refreshed["base_sha"] == "d" * 40
    assert refreshed["snapshot_date"] == "2026-08-24"
    assert refreshed["pull_requests"][0]["number"] == 783
    assert refreshed["pull_requests"][0]["title"] == "current dependency title"
    assert refreshed["pull_requests"][0]["head_sha"] == "b" * 40
    assert refreshed["pull_requests"][0]["head_sha_status"] == "exact_current_head"
    assert refreshed["pull_requests"][0]["draft"] is True
    assert refreshed["pull_requests"][0]["updated_at"] == "2026-09-01T23:45:01Z"
    assert (
        refreshed["pull_requests"][0]["initial_disposition"]
        == "canonical_dependency_security_base"
    )
    assert refreshed["pull_requests"][1]["number"] == 1002
    assert refreshed["pull_requests"][1]["draft"] is False
    assert refreshed["pull_requests"][1]["updated_at"] == "2026-09-01T12:34:56Z"
    assert refreshed["pull_requests"][1]["initial_train"] == "T8"
    assert refreshed["pull_requests"][1]["initial_disposition"] == "triage_required"
    assert refreshed["trains"]["T8"]["issue"] == 966


def test_refresh_preserves_reviewed_predecessors_and_defaults_new_prs_to_root() -> None:
    """Live identity refresh must not erase reviewed dependency routing."""
    refresher = _load_refresher()
    live = {
        "incomplete_results": False,
        "pull_requests": [
            _live_pr(700, "7" * 40),
            _live_pr(783, "b" * 40),
            _live_pr(1002, "c" * 40),
        ],
    }

    refreshed = refresher.build_refreshed_manifest(
        _seed_with_predecessor(),
        live,
        base_sha="d" * 40,
        snapshot_date="2026-09-01",
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert by_number[783]["predecessor_prs"] == [700]
    assert by_number[700]["predecessor_prs"] == []
    assert by_number[1002]["predecessor_prs"] == []


@pytest.mark.parametrize(
    ("live", "expected"),
    [
        ({"incomplete_results": True, "pull_requests": []}, "incomplete"),
        (
            {
                "incomplete_results": False,
                "pull_requests": [_live_pr(783, "b" * 40), _live_pr(783, "c" * 40)],
            },
            "duplicate pull request number",
        ),
        (
            {"incomplete_results": False, "pull_requests": [_live_pr(783, "not-a-sha")]},
            "head.sha",
        ),
        (
            {
                "incomplete_results": False,
                "pull_requests": [_live_pr(783, "b" * 40, base_ref="main")],
            },
            "base.ref",
        ),
        (
            {
                "incomplete_results": False,
                "pull_requests": [_live_pr(783, "b" * 40, base_sha=None)],
            },
            "base.sha",
        ),
        (
            {
                "incomplete_results": False,
                "pull_requests": [_live_pr(783, "b" * 40, base_sha="not-a-sha")],
            },
            "base.sha",
        ),
    ],
)
def test_refresh_manifest_rejects_untrustworthy_live_inventory(
    live: dict[str, object], expected: str
) -> None:
    """Incomplete, duplicate, malformed, or unresolved-base live evidence fails closed."""
    refresher = _load_refresher()

    with pytest.raises(refresher.RefreshError, match=expected):
        refresher.build_refreshed_manifest(
            _seed(), live, base_sha="d" * 40, snapshot_date="2026-08-24"
        )


def test_github_request_uses_fixed_https_host_and_relative_repo_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Token-bearing live reads connect only to the canonical GitHub API host."""
    refresher = _load_refresher()
    observed: dict[str, object] = {}

    class FakeResponse:
        status = 200
        reason = "OK"

        def read(self, amount: int) -> bytes:
            observed["read_amount"] = amount
            return b'{"ok":true}'

        def getheader(self, name: str, default: str = "") -> str:
            assert name == "Link"
            return default

    class FakeConnection:
        def __init__(self, host: str, *, timeout: int) -> None:
            observed["host"] = host
            observed["timeout"] = timeout

        def request(self, method: str, path: str, *, headers: dict[str, str]) -> None:
            observed["method"] = method
            observed["path"] = path
            observed["headers"] = headers

        def getresponse(self) -> FakeResponse:
            return FakeResponse()

        def close(self) -> None:
            observed["closed"] = True

    monkeypatch.setattr(refresher.http.client, "HTTPSConnection", FakeConnection)

    payload, link = refresher._request_github_json(
        "/repos/ContextualWisdomLab/bandscope/branches/develop", "token-value"
    )

    assert payload == {"ok": True}
    assert link == ""
    assert observed["host"] == "api.github.com"
    assert observed["method"] == "GET"
    assert observed["path"] == "/repos/ContextualWisdomLab/bandscope/branches/develop"
    assert observed["headers"]["Authorization"] == "Bearer token-value"
    assert observed["closed"] is True


def test_github_request_rejects_absolute_or_foreign_paths_before_connecting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Caller-controlled authorities cannot be smuggled into a token-bearing request target."""
    refresher = _load_refresher()

    def unexpected_connection(host: str, *, timeout: int) -> object:
        raise AssertionError(f"unexpected connection to {host} with timeout {timeout}")

    monkeypatch.setattr(refresher.http.client, "HTTPSConnection", unexpected_connection)

    for target in (
        "https://api.github.com/repos/ContextualWisdomLab/bandscope/branches/develop",
        "//evil.example/repos/ContextualWisdomLab/bandscope",
        "/repos/other-owner/other-repo/pulls",
    ):
        with pytest.raises(refresher.RefreshError, match="repository path"):
            refresher._request_github_json(target, "token-value")
