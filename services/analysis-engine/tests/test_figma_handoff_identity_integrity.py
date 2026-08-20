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


def documents_with_all_page_identities(payload: dict[str, object]) -> dict[str, str]:
    """Return synthetic docs that independently carry every canonical page identity."""
    file_url = payload["fileUrl"]
    file_key = payload["fileKey"]
    pages = payload["canonicalPages"]
    assert isinstance(file_url, str)
    assert isinstance(file_key, str)
    assert isinstance(pages, list)
    lines = [
        file_url,
        file_key,
        "Figma MCP get_metadata without nodeId lists only the current page.",
    ]
    for page in pages:
        assert isinstance(page, dict)
        lines.append(f"{page['name']} page {page['pageId']} root {page['rootId']}")
    body = "\n".join(lines)
    return {"README": body, "workflow": body, "contract": body}


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


@pytest.mark.parametrize(
    ("target_document", "page_index"),
    [
        ("workflow", 1),
        ("contract", 4),
    ],
)
def test_referencing_docs_label_undiscoverable_pages(
    target_document: str,
    page_index: int,
) -> None:
    """Every repository doc that still references a page must disclose lost discoverability."""
    payload = committed_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    page = pages[page_index]
    assert isinstance(page, dict)
    page["discoverable"] = False
    name = page["name"]
    assert isinstance(name, str)
    marker = f"{name} is not discoverable"

    documents = check.read_documents(REPO_ROOT)
    for label in documents:
        if label != target_document:
            documents[label] += f"\n{marker}\n"

    errors = check.collect_doc_errors(payload, check.canonical_pages(payload), documents)

    assert f"{target_document} must mark {name} as not discoverable" in errors


@pytest.mark.parametrize(
    ("target_document", "identity_key"),
    [
        ("workflow", "pageId"),
        ("contract", "rootId"),
    ],
)
def test_every_contract_doc_requires_each_canonical_page_identity(
    target_document: str,
    identity_key: str,
) -> None:
    """Workflow and component contract cannot borrow page identity evidence from README."""
    payload = committed_inventory()
    pages = check.canonical_pages(payload)
    documents = documents_with_all_page_identities(payload)
    page = pages[1]
    identity = str(page[identity_key])
    documents[target_document] = documents[target_document].replace(identity, "missing-id", 1)

    errors = check.collect_doc_errors(payload, pages, documents)

    assert f"{target_document} missing {identity_key} {identity} for {page['name']}" in errors
