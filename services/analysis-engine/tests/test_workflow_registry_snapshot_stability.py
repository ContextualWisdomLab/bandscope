"""Regression coverage for registry stability across one audit."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = ROOT / "scripts" / "checks" / "audit_workflow_registry.py"


def _load_module() -> ModuleType:
    """Load the detector from its repository script path."""
    spec = importlib.util.spec_from_file_location("audit_workflow_registry_stability", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load workflow registry audit module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _ChangingRegistryClient:
    """Return two complete, same-count registry snapshots with different identities."""

    def __init__(self) -> None:
        self._workflow_snapshots = [
            [
                {
                    "id": 20,
                    "name": "CI",
                    "path": ".github/workflows/ci.yml",
                    "state": "active",
                }
            ],
            [
                {
                    "id": 21,
                    "name": "Release",
                    "path": ".github/workflows/release.yml",
                    "state": "active",
                }
            ],
        ]

    def fetch_ref_sha(self, _repository: str, _branch: str) -> str:
        """Keep the protected branch stable while the registry changes."""
        return "a" * 40

    def fetch_workflows(
        self,
        _repository: str,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Return the next complete registry observation."""
        workflows = self._workflow_snapshots.pop(0)
        return workflows, [
            {
                "page": 1,
                "url": "https://api.github.com/repos/ContextualWisdomLab/bandscope/actions/workflows",
                "status": 200,
                "item_count": len(workflows),
            }
        ]

    def fetch_tree_paths(self, _repository: str, _sha: str) -> set[str]:
        """Expose both paths so only registry instability can fail the audit."""
        return {".github/workflows/ci.yml", ".github/workflows/release.yml"}


def test_audit_rejects_same_count_registry_replacement() -> None:
    """Fail closed when complete same-count observations identify different workflows."""
    module = _load_module()

    with pytest.raises(module.AuditError, match="workflow registry changed during audit"):
        module.audit_repository(
            _ChangingRegistryClient(),
            repository="ContextualWisdomLab/bandscope",
            branch="develop",
            observed_at="2026-08-19T00:00:00Z",
        )
