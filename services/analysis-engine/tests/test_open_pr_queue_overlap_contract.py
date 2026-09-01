"""Regression tests for overlap ownership and explicit PR succession routing."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFIER_PATH = REPO_ROOT / "scripts" / "checks" / "verify_open_pr_queue.py"
REFRESHER_PATH = REPO_ROOT / "scripts" / "checks" / "refresh_open_pr_queue.py"


def _load_module(path: Path, module_name: str) -> ModuleType:
    """Load one queue script without requiring scripts to be a Python package."""
    sys.path.insert(0, str(path.parent))
    try:
        spec = importlib.util.spec_from_file_location(module_name, path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _manifest() -> dict[str, Any]:
    """Return a valid queue with one reviewed overlap and one explicit successor."""
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-09-01",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": "a" * 40,
        "open_pr_count": 3,
        "authority_note": "Refresh exact live evidence before action.",
        "trains": {"T3": {"description": "Active rehearsal player", "issue": 961}},
        "pull_requests": [
            {
                "number": 1007,
                "title": "canonical handoff owner",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/1007",
                "initial_train": "T3",
                "initial_disposition": "triage_required",
                "head_sha": "1" * 40,
                "head_sha_status": "exact_current_head",
                "predecessor_prs": [],
                "overlap_prs": [1094],
                "successor_pr": None,
            },
            {
                "number": 1094,
                "title": "older overlapping handoff writer",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/1094",
                "initial_train": "T3",
                "initial_disposition": "triage_required",
                "head_sha": "2" * 40,
                "head_sha_status": "exact_current_head",
                "predecessor_prs": [],
                "overlap_prs": [1007],
                "successor_pr": 1007,
            },
            {
                "number": 1120,
                "title": "independent collaboration slice",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/1120",
                "initial_train": "T3",
                "initial_disposition": "triage_required",
                "head_sha": "3" * 40,
                "head_sha_status": "exact_current_head",
                "predecessor_prs": [],
                "overlap_prs": [],
                "successor_pr": None,
            },
        ],
    }


def test_manifest_accepts_symmetric_overlap_with_explicit_successor() -> None:
    """Reviewed overlap may name one canonical successor without implying merge readiness."""
    verifier = _load_module(VERIFIER_PATH, "verify_open_pr_queue_overlap")
    verifier.validate_manifest(_manifest())


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (
            lambda manifest: manifest["pull_requests"][1].update(overlap_prs=[9999]),
            "unknown overlap",
        ),
        (
            lambda manifest: manifest["pull_requests"][1].update(overlap_prs=[1094]),
            "overlap itself",
        ),
        (
            lambda manifest: manifest["pull_requests"][0].update(overlap_prs=[]),
            "symmetric",
        ),
        (
            lambda manifest: manifest["pull_requests"][1].update(successor_pr=1120),
            "must also be declared in overlap_prs",
        ),
    ],
)
def test_manifest_rejects_ambiguous_overlap_or_succession(mutate, expected: str) -> None:
    """Unknown, self, unilateral, or unrelated succession evidence must fail closed."""
    verifier = _load_module(VERIFIER_PATH, "verify_open_pr_queue_overlap_invalid")
    manifest = _manifest()
    mutate(manifest)

    with pytest.raises(verifier.ManifestError, match=expected):
        verifier.validate_manifest(manifest)


def test_manifest_rejects_successor_cycle() -> None:
    """Two PRs cannot each claim the other as their canonical successor."""
    verifier = _load_module(VERIFIER_PATH, "verify_open_pr_queue_successor_cycle")
    manifest = _manifest()
    manifest["pull_requests"][0]["successor_pr"] = 1094

    with pytest.raises(verifier.ManifestError, match="successor cycle"):
        verifier.validate_manifest(manifest)


def test_refresh_preserves_reviewed_overlap_and_defaults_new_prs_to_unowned() -> None:
    """A live identity refresh must preserve reviewed overlap routing without inventing ownership."""
    refresher = _load_module(REFRESHER_PATH, "refresh_open_pr_queue_overlap")
    seed = _manifest()
    seed["open_pr_count"] = 2
    seed["pull_requests"] = seed["pull_requests"][:2]

    def live_pr(number: int, head_sha: str) -> dict[str, object]:
        return {
            "number": number,
            "title": f"PR {number}",
            "html_url": f"https://github.com/ContextualWisdomLab/bandscope/pull/{number}",
            "state": "open",
            "base": {"ref": "develop", "sha": "d" * 40},
            "head": {"sha": head_sha},
        }

    refreshed = refresher.build_refreshed_manifest(
        seed,
        {
            "incomplete_results": False,
            "pull_requests": [
                live_pr(1007, "4" * 40),
                live_pr(1094, "5" * 40),
                live_pr(1120, "6" * 40),
            ],
        },
        base_sha="d" * 40,
        snapshot_date="2026-09-01",
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert by_number[1007]["overlap_prs"] == [1094]
    assert by_number[1007]["successor_pr"] is None
    assert by_number[1094]["overlap_prs"] == [1007]
    assert by_number[1094]["successor_pr"] == 1007
    assert by_number[1120]["overlap_prs"] == []
    assert by_number[1120]["successor_pr"] is None
