"""Regression tests for GitHub GraphQL check-run readiness projection."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[3]
COLLECTOR_PATH = REPO_ROOT / "scripts" / "checks" / "collect_open_pr_readiness.py"


def _load_collector() -> ModuleType:
    """Load the queue readiness collector without executing its CLI entry point."""
    sys.path.insert(0, str(COLLECTOR_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location(
            "collect_open_pr_readiness_graphql_schema",
            COLLECTOR_PATH,
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _pull_request_node(head_sha: str) -> dict[str, object]:
    """Model GitHub's CheckRun -> CheckSuite -> App GraphQL ownership shape."""
    return {
        "commits": {
            "nodes": [
                {
                    "commit": {
                        "oid": head_sha,
                        "statusCheckRollup": {
                            "contexts": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [
                                    {
                                        "__typename": "CheckRun",
                                        "name": "ci / build-and-test",
                                        "status": "COMPLETED",
                                        "conclusion": "SUCCESS",
                                        "checkSuite": {
                                            "app": {"databaseId": 15368},
                                        },
                                    }
                                ],
                            }
                        },
                    }
                }
            ]
        }
    }


def test_graphql_query_requests_app_identity_through_check_suite() -> None:
    """CheckRun app identity must use the live CheckSuite.app schema path."""
    collector = _load_collector()

    query = collector._graphql_batch_query([968])

    assert "checkSuite" in query
    assert "app { databaseId }" in query


def test_check_context_normalization_preserves_required_app_identity() -> None:
    """Required-check matching must retain the app id from CheckSuite.app."""
    collector = _load_collector()
    head_sha = "a" * 40

    contexts = collector._normalize_check_contexts(_pull_request_node(head_sha), head_sha)

    assert contexts == [
        {
            "context": "ci / build-and-test",
            "app_id": 15368,
            "passing": True,
        }
    ]
