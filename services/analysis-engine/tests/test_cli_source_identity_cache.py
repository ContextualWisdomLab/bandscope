"""Regression coverage for native source-identity cache scoping."""

from __future__ import annotations

import io
import json

import pytest

from bandscope_analysis import cli
from bandscope_analysis.cli import _bind_verified_source_cache_namespace


def _local_request(cache_root: object = "/tmp/cache") -> dict[str, object]:
    """Return the minimum local request surface relevant to cache scoping."""
    return {
        "sourceKind": "local_audio",
        "cacheRoot": cache_root,
    }


def test_missing_verified_digest_disables_persisted_local_cache() -> None:
    """Do not reuse path/name/size-addressed caches when exact source identity is absent."""
    bound = _bind_verified_source_cache_namespace(_local_request(), None)

    assert isinstance(bound, dict)
    assert "cacheRoot" not in bound


def test_invalid_verified_digest_fails_closed() -> None:
    """Reject a malformed digest instead of creating an attacker-shaped cache namespace."""
    with pytest.raises(ValueError, match="sourceContentSha256"):
        _bind_verified_source_cache_namespace(_local_request(), "../not-a-digest")


def test_demo_request_rejects_local_source_digest_authority() -> None:
    """Keep source-content authority exclusive to local-audio analysis."""
    with pytest.raises(ValueError, match="sourceContentSha256"):
        _bind_verified_source_cache_namespace({"sourceKind": "demo"}, "ab" * 32)


def test_invalid_cache_root_type_remains_for_canonical_request_validation() -> None:
    """Do not hide an independently malformed cacheRoot when no digest is present."""
    request = _local_request(cache_root=7)

    assert _bind_verified_source_cache_namespace(request, None) == request


def test_missing_digest_does_not_hide_invalid_cache_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Validate request fields before digest scoping can disable persisted caching."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-invalid-cache-root",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "project-1",
                    "sourceLabel": "source.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/tmp/source.wav",
                        "fileName": "source.wav",
                        "extension": "wav",
                        "fileSizeBytes": 4,
                    },
                    "cacheRoot": "../cache",
                },
            }
        )
    )
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])

    assert cli.main() == 0
    response = json.loads(stdout.getvalue())
    assert response["state"] == "failed"
    assert response["error"]["message"] == (
        "Invalid analysis job request: path traversal detected in 'cacheRoot'"
    )
