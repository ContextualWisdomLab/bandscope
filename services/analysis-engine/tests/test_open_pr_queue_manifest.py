"""Regression tests for the BandScope open pull-request queue manifest contract."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFIER_PATH = REPO_ROOT / "scripts" / "checks" / "verify_open_pr_queue.py"
QUICKCHECK_PATH = REPO_ROOT / "scripts" / "harness" / "quickcheck.sh"


def _load_verifier() -> ModuleType:
    """Load the repository verifier without requiring scripts to be a Python package."""
    spec = importlib.util.spec_from_file_location("verify_open_pr_queue", VERIFIER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _valid_manifest() -> dict[str, object]:
    """Return the smallest representative queue manifest accepted by the contract."""
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-08-20",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": "a" * 40,
        "open_pr_count": 2,
        "authority_note": "Refresh exact live evidence before action.",
        "trains": {
            "T0": {"description": "Dependency base", "issue": 966},
            "T6": {"description": "Diagnostics", "issue": 963},
        },
        "pull_requests": [
            {
                "number": 783,
                "title": "dependency baseline",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/783",
                "initial_train": "T0",
                "initial_disposition": "canonical_dependency_security_base",
                "head_sha": None,
                "head_sha_status": "refresh_required_before_action",
            },
            {
                "number": 967,
                "title": "support manifest",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/967",
                "initial_train": "T6",
                "initial_disposition": "triage_required",
                "head_sha": "b" * 40,
                "head_sha_status": "exact_current_head",
            },
        ],
    }


def _append_duplicate_pr(manifest: dict[str, object]) -> None:
    """Duplicate one PR while keeping the declared count internally consistent."""
    pull_requests = manifest["pull_requests"]
    assert isinstance(pull_requests, list)
    pull_requests.append(dict(pull_requests[0]))
    manifest["open_pr_count"] = len(pull_requests)


def test_open_pr_queue_manifest_accepts_a_well_formed_seed() -> None:
    """A structurally consistent seed is accepted without network access."""
    verifier = _load_verifier()
    verifier.validate_manifest(_valid_manifest())


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda manifest: manifest.update(open_pr_count=3), "open_pr_count"),
        (_append_duplicate_pr, "duplicate pull request number"),
        (
            lambda manifest: manifest["pull_requests"][0].update(initial_train="T99"),
            "unknown train",
        ),
        (
            lambda manifest: manifest["pull_requests"][0].update(
                head_sha=None, head_sha_status="exact_current_head"
            ),
            "refresh_required_before_action",
        ),
        (
            lambda manifest: manifest["pull_requests"][1].update(
                head_sha="not-a-commit", head_sha_status="exact_current_head"
            ),
            "40 hexadecimal",
        ),
    ],
)
def test_open_pr_queue_manifest_fails_closed_on_corrupt_evidence(mutate, expected: str) -> None:
    """Count, identity, train, and exact-head evidence drift must fail closed."""
    verifier = _load_verifier()
    manifest = _valid_manifest()
    mutate(manifest)

    with pytest.raises(verifier.ManifestError, match=expected):
        verifier.validate_manifest(manifest)


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda manifest: manifest.update(merge_ready=True), "manifest has unsupported field"),
        (
            lambda manifest: manifest["trains"]["T0"].update(owner="dependency-team"),
            "trains.T0 has unsupported field",
        ),
        (
            lambda manifest: manifest["pull_requests"][0].update(merge_ready=True),
            r"pull_requests\[0\] has unsupported field",
        ),
    ],
)
def test_open_pr_queue_manifest_rejects_unsupported_evidence_fields(mutate, expected: str) -> None:
    """Unreviewed fields must not smuggle unsupported success or ownership evidence into the queue."""
    verifier = _load_verifier()
    manifest = _valid_manifest()
    mutate(manifest)

    with pytest.raises(verifier.ManifestError, match=expected):
        verifier.validate_manifest(manifest)


def test_quickcheck_executes_open_pr_queue_verifier() -> None:
    """The repository harness must execute the queue contract on every normal quickcheck."""
    quickcheck = QUICKCHECK_PATH.read_text(encoding="utf-8")
    assert "python3 scripts/checks/verify_open_pr_queue.py" in quickcheck
