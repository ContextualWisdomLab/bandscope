"""Regression tests for the offline Figma handoff inventory check."""

from __future__ import annotations

import importlib.util
import json
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
CHECK_PATH = REPO_ROOT / "scripts" / "checks" / "verify_figma_handoff.py"


def load_check_module() -> ModuleType:
    """Import the repository Figma handoff checker without installing it."""
    spec = importlib.util.spec_from_file_location("verify_figma_handoff", CHECK_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check = load_check_module()


VALID_PAGES = [
    {
        "name": "00 Cover",
        "pageId": "16:2",
        "rootId": "16:3",
        "discoverable": True,
    },
    {
        "name": "28 Implementation Contract",
        "pageId": "37:2",
        "rootId": "99:2",
        "discoverable": True,
    },
    {
        "name": "29 UI Repair Playbook",
        "pageId": "38:2",
        "rootId": "99:82",
        "discoverable": True,
    },
    {
        "name": "30 Publisher + QA Matrix",
        "pageId": "39:2",
        "rootId": "99:171",
        "discoverable": True,
    },
    {
        "name": "31 Component Contract Catalog",
        "pageId": "45:86",
        "rootId": "99:253",
        "discoverable": True,
    },
    {
        "name": "32 Screen Blueprints",
        "pageId": "45:270",
        "rootId": "99:415",
        "discoverable": True,
    },
    {
        "name": "33 Figma-Only Readiness Audit",
        "pageId": "45:316",
        "rootId": "99:714",
        "discoverable": True,
    },
    {
        "name": "34 Workspace State Matrix",
        "pageId": "80:2",
        "rootId": "99:560",
        "discoverable": True,
    },
]


def valid_inventory(**overrides: object) -> dict[str, object]:
    """Return a complete inventory payload with optional field overrides."""
    payload: dict[str, object] = {
        "fileKey": "zthWmqfNKUgJBECvv002Qk",
        "fileUrl": "https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk",
        "verifiedAt": "2026-08-21",
        "verificationMethod": "figma_plugin_api_root_children_after_setCurrentPageAsync",
        "mcpPageListLimitation": (
            "Figma MCP get_metadata without nodeId lists only the current page."
        ),
        "canonicalPages": [dict(page) for page in VALID_PAGES],
    }
    payload.update(overrides)
    return payload


def docs_for(payload: dict[str, object], *, hide_cover_page_id: bool = False) -> dict[str, str]:
    """Build README, workflow, and contract text that matches ``payload``."""
    file_url = str(payload["fileUrl"])
    file_key = str(payload["fileKey"])
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    lines = [
        f"Figma file: {file_url}",
        f"File key: {file_key}",
        "Figma MCP get_metadata without nodeId lists only the current page.",
        "Open page 28 next and choose a source control or contract row before coding.",
    ]
    for page in pages:
        assert isinstance(page, dict)
        name = page["name"]
        page_id = page["pageId"]
        root_id = page["rootId"]
        if hide_cover_page_id and name == "00 Cover":
            lines.append(f"- `{name}` root `{root_id}`")
        else:
            lines.append(f"- `{name}` page `{page_id}` root `{root_id}`")
        if page["discoverable"] is False:
            lines.append(f"{name} is not discoverable")
    body = "\n".join(lines) + "\n"
    return {"README": body, "workflow": body, "contract": f"{file_url}\n{file_key}\n"}


def write_repo(tmp_path: Path, payload: dict[str, object], documents: dict[str, str]) -> Path:
    """Write a miniature design-system tree under ``tmp_path``."""
    design = tmp_path / "docs" / "design-system"
    design.mkdir(parents=True)
    (design / "figma-handoff-inventory.json").write_text(
        json.dumps(payload),
        encoding="utf-8",
    )
    (design / "README.md").write_text(documents["README"], encoding="utf-8")
    (design / "figma-to-code-workflow.md").write_text(documents["workflow"], encoding="utf-8")
    (design / "component-contract.md").write_text(documents["contract"], encoding="utf-8")
    return tmp_path


def test_canonical_pages_accept_complete_inventory() -> None:
    """A complete inventory validates and preserves page identity."""
    pages = check.canonical_pages(valid_inventory())
    assert pages[0]["pageId"] == "16:2"
    assert pages[-1]["rootId"] == "99:560"


@pytest.mark.parametrize(
    ("mutator", "match"),
    [
        (lambda payload: payload.pop("fileKey"), "missing fileKey"),
        (lambda payload: payload.__setitem__("canonicalPages", []), "non-empty array"),
        (lambda payload: payload.__setitem__("canonicalPages", ["nope"]), "must be an object"),
        (
            lambda payload: payload["canonicalPages"].append(payload["canonicalPages"][0]),
            "duplicate canonical page name",
        ),
    ],
)
def test_canonical_pages_reject_invalid_payloads(
    mutator: Callable[[dict[str, object]], object],
    match: str,
) -> None:
    """Schema defects fail closed before documentation comparison."""
    payload = valid_inventory()
    mutator(payload)
    with pytest.raises(check.HandoffError, match=match):
        check.canonical_pages(payload)


def test_canonical_pages_reject_bad_field_types() -> None:
    """Page records require colon-form IDs and a boolean discoverable flag."""
    payload = valid_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    pages[0] = {
        "name": "",
        "pageId": "16-2",
        "rootId": "16-3",
        "discoverable": "yes",
    }
    with pytest.raises(check.HandoffError, match="name must be a non-empty string"):
        check.canonical_pages(payload)
    pages[0] = {
        "name": "00 Cover",
        "pageId": "16-2",
        "rootId": "16:3",
        "discoverable": True,
    }
    with pytest.raises(check.HandoffError, match="pageId must use colon form"):
        check.canonical_pages(payload)
    pages[0] = {
        "name": "00 Cover",
        "pageId": "16:2",
        "rootId": "16-3",
        "discoverable": True,
    }
    with pytest.raises(check.HandoffError, match="rootId must use colon form"):
        check.canonical_pages(payload)
    pages[0] = {
        "name": "00 Cover",
        "pageId": "16:2",
        "rootId": "16:3",
        "discoverable": "yes",
    }
    with pytest.raises(check.HandoffError, match="discoverable must be a boolean"):
        check.canonical_pages(payload)
    pages[0] = {"name": "00 Cover"}
    with pytest.raises(check.HandoffError, match="missing pageId"):
        check.canonical_pages(payload)


def test_canonical_pages_reject_missing_required_name() -> None:
    """Dropping a required contract page is inventory drift."""
    payload = valid_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    pages.pop()
    with pytest.raises(check.HandoffError, match="missing required pages"):
        check.canonical_pages(payload)


def test_load_inventory_errors(tmp_path: Path) -> None:
    """Missing, invalid, and non-object inventory files fail closed."""
    missing = tmp_path / "missing.json"
    with pytest.raises(check.HandoffError, match="missing inventory"):
        check.load_inventory(missing)
    invalid = tmp_path / "invalid.json"
    invalid.write_text("{", encoding="utf-8")
    with pytest.raises(check.HandoffError, match="invalid inventory JSON"):
        check.load_inventory(invalid)
    array_path = tmp_path / "array.json"
    array_path.write_text("[]", encoding="utf-8")
    with pytest.raises(check.HandoffError, match="inventory root must be an object"):
        check.load_inventory(array_path)


def test_collect_doc_errors_on_matching_docs() -> None:
    """Matching docs against a discoverable inventory produce no errors."""
    payload = valid_inventory()
    errors = check.collect_doc_errors(payload, check.canonical_pages(payload), docs_for(payload))
    assert errors == []


def test_collect_doc_errors_for_drift() -> None:
    """Missing IDs, URLs, and MCP warnings are reported as drift."""
    payload = valid_inventory(fileUrl="https://www.figma.com/design/other")
    documents = {
        "README": "no markers",
        "workflow": "no markers",
        "contract": "no markers",
    }
    errors = check.collect_doc_errors(payload, check.canonical_pages(valid_inventory()), documents)
    assert "inventory fileUrl must contain fileKey" in errors
    assert any(item.startswith("README missing Figma file URL") for item in errors)
    assert any("get_metadata without nodeId" in item for item in errors)
    assert any(item.startswith("README missing page name") for item in errors)


def test_collect_doc_errors_for_undiscoverable_page() -> None:
    """Undiscoverable pages must be labeled and must not be claimed current."""
    payload = valid_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    pages[1]["discoverable"] = False
    documents = docs_for(payload)
    documents["README"] += "\nCurrent verified Figma root IDs include `99:2`.\n"
    errors = check.collect_doc_errors(payload, check.canonical_pages(payload), documents)
    assert any("must not claim unverified root 99:2" in item for item in errors)


def test_collect_doc_errors_undiscoverable_without_label() -> None:
    """An undiscoverable page without an explicit README label is drift."""
    payload = valid_inventory()
    pages = payload["canonicalPages"]
    assert isinstance(pages, list)
    pages[1]["discoverable"] = False
    documents = docs_for(payload)
    documents["README"] = documents["README"].replace(
        "28 Implementation Contract is not discoverable",
        "",
    )
    errors = check.collect_doc_errors(payload, check.canonical_pages(payload), documents)
    assert any(
        "must mark 28 Implementation Contract as not discoverable" in item for item in errors
    )


def test_collect_doc_errors_missing_page_id() -> None:
    """README must cite Plugin API page IDs, not only root frames."""
    payload = valid_inventory()
    errors = check.collect_doc_errors(
        payload,
        check.canonical_pages(payload),
        docs_for(payload, hide_cover_page_id=True),
    )
    assert "README missing pageId 16:2 for 00 Cover" in errors


def test_collect_doc_errors_for_weak_inventory_prose() -> None:
    """Inventory method and limitation fields must name the actual procedure."""
    payload = valid_inventory(
        mcpPageListLimitation="metadata is incomplete",
        verificationMethod="looked at the cover",
        fileKey="   ",
    )
    with pytest.raises(check.HandoffError, match="fileKey must be a non-empty string"):
        check.collect_doc_errors(
            payload, check.canonical_pages(valid_inventory()), docs_for(valid_inventory())
        )
    payload = valid_inventory(
        mcpPageListLimitation="metadata is incomplete",
        verificationMethod="looked at the cover",
    )
    errors = check.collect_doc_errors(payload, check.canonical_pages(payload), docs_for(payload))
    assert "inventory mcpPageListLimitation must name get_metadata without nodeId" in errors
    assert "inventory verificationMethod must load pages with setCurrentPageAsync" in errors


def test_verify_and_main_on_temp_repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """``verify`` and ``main`` succeed on a matching tree and fail on drift."""
    payload = valid_inventory()
    write_repo(tmp_path, payload, docs_for(payload))
    monkeypatch.chdir(tmp_path)
    assert check.verify() == []
    assert check.main([]) == 0
    readme = tmp_path / "docs" / "design-system" / "README.md"
    readme.write_text("stale", encoding="utf-8")
    assert check.main([]) == 1


def test_verify_missing_document(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing contract document fails before comparison."""
    payload = valid_inventory()
    write_repo(tmp_path, payload, docs_for(payload))
    (tmp_path / "docs" / "design-system" / "component-contract.md").unlink()
    monkeypatch.chdir(tmp_path)
    with pytest.raises(check.HandoffError, match="missing document"):
        check.verify()


def test_main_reports_handoff_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``main`` prints a stable failure when the inventory file is absent."""
    monkeypatch.chdir(tmp_path)
    assert check.main(["unused"]) == 1
    captured = capsys.readouterr()
    assert "Figma handoff check failed" in captured.out


def test_repository_inventory_currently_passes() -> None:
    """The committed BandScope inventory must stay consistent with its docs."""
    errors = check.verify(REPO_ROOT)
    assert errors == []
