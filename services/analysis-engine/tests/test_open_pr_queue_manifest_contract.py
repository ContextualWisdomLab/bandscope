"""Regression tests for fail-closed BandScope open-PR queue authority."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFIER_PATH = REPO_ROOT / "scripts" / "checks" / "verify_open_pr_queue.py"


def _load_verifier() -> ModuleType:
    """Load the queue verifier without requiring scripts to be a Python package."""
    spec = importlib.util.spec_from_file_location("verify_open_pr_queue_contract", VERIFIER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _manifest() -> dict[str, object]:
    """Return the smallest valid queue manifest used by authority regressions."""
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-08-24",
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
                "title": "canonical dependency security",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/783",
                "initial_train": "T0",
                "initial_disposition": "triage_required",
                "head_sha": None,
                "head_sha_status": "refresh_required_before_action",
            }
        ],
    }


def test_manifest_rejects_unsupported_initial_disposition() -> None:
    """Routing evidence must not accept success-shaped or otherwise unreviewed dispositions."""
    verifier = _load_verifier()
    manifest = _manifest()
    manifest["pull_requests"][0]["initial_disposition"] = "merge_ready"

    with pytest.raises(verifier.ManifestError, match="initial_disposition"):
        verifier.validate_manifest(manifest)


def test_manifest_requires_explicit_head_sha_key() -> None:
    """A missing head identity must not masquerade as an explicit refresh-required null value."""
    verifier = _load_verifier()
    manifest = _manifest()
    del manifest["pull_requests"][0]["head_sha"]

    with pytest.raises(verifier.ManifestError, match="head_sha is required"):
        verifier.validate_manifest(manifest)
