"""Regressions for fail-closed Figma page identity and current-root evidence."""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
CHECK_PATH = REPO_ROOT / "scripts" / "checks" / "verify_figma_handoff.py"
INVENTORY_PATH = REPO_ROOT / "docs" / "design-system" / "figma-handoff-inventory.json"


def load_check_module() -> ModuleType:
    """Import the repository Figma handoff checker without installing it."""
    spec = importlib.util.spec_from_file_location("verify_figma_handoff_identity", CHECK_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check = load_check_module()


def committed_inventory() -> dict[str, object]:
    """Return an independently parsed mutable copy of the committed inventory."""
    payload = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return copy.deepcopy(payload)


@pytest.mark.parametrize(
    ("field", "match"),
    [
        ("pageId", "duplicate canonical pageId"),
        ("rootId", "duplicate canonical rootId"),
    ],
)
def test_canonical_pages_reject_duplicate_node_identity(field: str, match: str) -> None:
    """Different canonical pages must never borrow the same page or root identity."""
    payload = committed_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    assert isinstance(pages[0], dict)
    assert isinstance(pages[1], dict)
    pages[1][field] = pages[0][field]

    with pytest.raises(check.HandoffError, match=match):
        check.canonical_pages(payload)


def test_undiscoverable_page_is_rejected_from_actual_current_id_section() -> None:
    """The real README current-ID heading must participate in the safety check."""
    payload = committed_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    assert isinstance(pages[1], dict)
    pages[1]["discoverable"] = False

    documents = check.read_documents(REPO_ROOT)
    documents["README"] += "\n28 Implementation Contract is not discoverable\n"
    errors = check.collect_doc_errors(payload, check.canonical_pages(payload), documents)

    assert "README must not claim unverified root 99:2 as current" in errors
