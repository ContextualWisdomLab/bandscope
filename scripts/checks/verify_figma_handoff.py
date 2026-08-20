"""Fail when committed Figma handoff evidence and design-system docs disagree.

Security Notes
--------------
The committed inventory and documentation text are treated as untrusted local input. This
checker reads repository files only; it does not open Figma URLs, make network requests, load
credentials, or grant the recorded identifiers any runtime authority.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

INVENTORY_PATH = Path("docs/design-system/figma-handoff-inventory.json")
README_PATH = Path("docs/design-system/README.md")
WORKFLOW_PATH = Path("docs/design-system/figma-to-code-workflow.md")
CONTRACT_PATH = Path("docs/design-system/component-contract.md")
REQUIRED_PAGE_NAMES = (
    "00 Cover",
    "28 Implementation Contract",
    "29 UI Repair Playbook",
    "30 Publisher + QA Matrix",
    "31 Component Contract Catalog",
    "32 Screen Blueprints",
    "33 Figma-Only Readiness Audit",
    "34 Workspace State Matrix",
)
MCP_LIMITATION_MARKERS = ("get_metadata", "without nodeId")
REQUIRED_INVENTORY_KEYS = (
    "fileKey",
    "fileUrl",
    "verifiedAt",
    "verificationMethod",
    "mcpPageListLimitation",
    "canonicalPages",
)
REQUIRED_PAGE_KEYS = ("name", "pageId", "rootId", "discoverable")


class HandoffError(ValueError):
    """Raised when the Figma handoff inventory or docs are internally inconsistent."""


def load_inventory(path: Path) -> dict[str, Any]:
    """Return the parsed inventory object or raise ``HandoffError``."""
    if not path.is_file():
        raise HandoffError(f"missing inventory: {path.as_posix()}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HandoffError(f"invalid inventory JSON: {path.as_posix()}: {exc}") from exc
    if not isinstance(payload, dict):
        raise HandoffError("inventory root must be an object")
    return payload


def _require_string(payload: Mapping[str, Any], key: str) -> str:
    """Return a non-empty string field from the inventory."""
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise HandoffError(f"inventory {key} must be a non-empty string")
    return value


def canonical_pages(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Return validated canonical page records from the inventory."""
    for key in REQUIRED_INVENTORY_KEYS:
        if key not in payload:
            raise HandoffError(f"inventory missing {key}")
    pages = payload.get("canonicalPages")
    if not isinstance(pages, list) or not pages:
        raise HandoffError("canonicalPages must be a non-empty array")
    validated: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    seen_page_ids: set[str] = set()
    seen_root_ids: set[str] = set()
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            raise HandoffError(f"canonicalPages[{index}] must be an object")
        for key in REQUIRED_PAGE_KEYS:
            if key not in page:
                raise HandoffError(f"canonicalPages[{index}] missing {key}")
        name = page["name"]
        page_id = page["pageId"]
        root_id = page["rootId"]
        discoverable = page["discoverable"]
        if not isinstance(name, str) or not name.strip():
            raise HandoffError(f"canonicalPages[{index}].name must be a non-empty string")
        if not isinstance(page_id, str) or ":" not in page_id:
            raise HandoffError(f"canonicalPages[{index}].pageId must use colon form")
        if not isinstance(root_id, str) or ":" not in root_id:
            raise HandoffError(f"canonicalPages[{index}].rootId must use colon form")
        if not isinstance(discoverable, bool):
            raise HandoffError(f"canonicalPages[{index}].discoverable must be a boolean")
        if name in seen_names:
            raise HandoffError(f"duplicate canonical page name: {name}")
        if page_id in seen_page_ids:
            raise HandoffError(f"duplicate canonical pageId: {page_id}")
        if root_id in seen_root_ids:
            raise HandoffError(f"duplicate canonical rootId: {root_id}")
        seen_names.add(name)
        seen_page_ids.add(page_id)
        seen_root_ids.add(root_id)
        validated.append(
            {
                "name": name,
                "pageId": page_id,
                "rootId": root_id,
                "discoverable": discoverable,
            }
        )
    missing_required = [name for name in REQUIRED_PAGE_NAMES if name not in seen_names]
    if missing_required:
        raise HandoffError("inventory missing required pages: " + ", ".join(missing_required))
    return validated


def _current_verified_id_block(readme: str) -> str:
    """Return the README block that explicitly presents Figma IDs as current."""
    block: list[str] = []
    collecting = False
    for line in readme.splitlines():
        if not collecting:
            if "Current verified Figma" in line and "root IDs" in line:
                collecting = True
                block.append(line)
            continue
        if line.startswith("  - "):
            block.append(line)
            continue
        if line.startswith("- "):
            break
    return "\n".join(block)


def collect_doc_errors(
    payload: Mapping[str, Any],
    pages: Sequence[Mapping[str, Any]],
    documents: Mapping[str, str],
) -> list[str]:
    """Return committed-inventory/document consistency errors.

    The README owns the complete current page/root identity index. Workflow and component-contract
    documents link the same Figma file and are checked only for identities they actually reference,
    avoiding a second duplicated canonical page inventory.
    """
    errors: list[str] = []
    file_url = _require_string(payload, "fileUrl")
    file_key = _require_string(payload, "fileKey")
    if file_key not in file_url:
        errors.append("inventory fileUrl must contain fileKey")
    limitation = _require_string(payload, "mcpPageListLimitation")
    if not all(marker in limitation for marker in MCP_LIMITATION_MARKERS):
        errors.append("inventory mcpPageListLimitation must name get_metadata without nodeId")
    method = _require_string(payload, "verificationMethod")
    if "setCurrentPageAsync" not in method:
        errors.append("inventory verificationMethod must load pages with setCurrentPageAsync")

    for label, content in documents.items():
        if file_url not in content:
            errors.append(f"{label} missing Figma file URL")
        if file_key not in content:
            errors.append(f"{label} missing Figma file key")

    readme = documents["README"]
    workflow = documents["workflow"]
    if not all(marker in readme for marker in MCP_LIMITATION_MARKERS):
        errors.append("README must warn that get_metadata without nodeId is not a page inventory")
    if not all(marker in workflow for marker in MCP_LIMITATION_MARKERS):
        errors.append("workflow must warn that get_metadata without nodeId is not a page inventory")

    current_id_block = _current_verified_id_block(readme)
    for page in pages:
        name = str(page["name"])
        page_id = str(page["pageId"])
        root_id = str(page["rootId"])
        if name not in readme:
            errors.append(f"README missing page name {name}")
        if page_id not in readme:
            errors.append(f"README missing pageId {page_id} for {name}")
        if root_id not in readme:
            errors.append(f"README missing rootId {root_id} for {name}")
        if page["discoverable"] is False:
            marker = f"{name} is not discoverable"
            for label, content in documents.items():
                references_page = any(token in content for token in (name, page_id, root_id))
                if references_page and marker not in content:
                    errors.append(f"{label} must mark {name} as not discoverable")
            if root_id in current_id_block:
                errors.append(f"README must not claim unverified root {root_id} as current")
    return errors


def read_documents(root: Path) -> dict[str, str]:
    """Read the design-system documents relative to ``root``."""
    documents: dict[str, str] = {}
    mapping = {
        "README": root / README_PATH,
        "workflow": root / WORKFLOW_PATH,
        "contract": root / CONTRACT_PATH,
    }
    for label, path in mapping.items():
        if not path.is_file():
            raise HandoffError(f"missing document: {path.as_posix()}")
        documents[label] = path.read_text(encoding="utf-8")
    return documents


def verify(root: Path | None = None) -> list[str]:
    """Return committed Figma inventory/document errors under ``root``."""
    base = Path.cwd() if root is None else root
    payload = load_inventory(base / INVENTORY_PATH)
    pages = canonical_pages(payload)
    documents = read_documents(base)
    return collect_doc_errors(payload, pages, documents)


def main(argv: Sequence[str] | None = None) -> int:
    """Print consistency errors and return a failing exit code when any exist."""
    del argv
    try:
        errors = verify()
    except HandoffError as exc:
        print(f"Figma handoff check failed: {exc}")
        return 1
    if errors:
        print("Figma handoff check failed:")
        for item in errors:
            print(f"- {item}")
        return 1
    print("Figma handoff check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
