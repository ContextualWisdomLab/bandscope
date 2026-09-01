#!/usr/bin/env python3
"""Render the BandScope merge-train manifest into a deterministic human view."""

from __future__ import annotations

import argparse
import html
import os
import sys
from pathlib import Path
from typing import Any

from verify_open_pr_queue import (
    DEFAULT_MANIFEST_PATH,
    ManifestError,
    load_manifest,
    validate_manifest,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
HUMAN_VIEW_PATH = REPO_ROOT / "docs" / "product-readiness" / "open-pr-queue.md"


class RenderError(ValueError):
    """Raised when the generated queue view cannot be published safely."""


def _escape_cell(value: object) -> str:
    """Render untrusted GitHub text as inert single-line Markdown table data."""
    text = str(value).replace("\r", " ").replace("\n", " ")
    return html.escape(text, quote=True).replace("|", r"\|")


def _pr_links(numbers: object) -> str:
    """Render a validated PR-number list without introducing external link authority."""
    if not isinstance(numbers, list):
        raise RenderError("pull-request relation must be an array")
    return ", ".join(f"#{number}" for number in numbers) if numbers else "—"


def render_queue_markdown(manifest: object) -> str:
    """Render one complete validated manifest without claiming merge readiness."""
    validate_manifest(manifest)
    if not isinstance(manifest, dict):
        raise ManifestError("manifest must be an object")

    trains = manifest["trains"]
    pull_requests = manifest["pull_requests"]
    assert isinstance(trains, dict)
    assert isinstance(pull_requests, list)

    lines = [
        "# BandScope open PR merge-train view",
        "",
        "> This is capture-time routing evidence generated from the machine-readable queue. "
        "It is not merge-readiness evidence. Refresh exact-head checks, reviews, unresolved "
        "threads, ancestry, mergeability, security findings, and active-writer state immediately "
        "before any material action.",
        "",
        f"- Snapshot: **{_escape_cell(manifest['snapshot_date'])}** "
        f"({_escape_cell(manifest['timezone'])})",
        f"- Protected target captured: "
        f"`{_escape_cell(manifest['base_branch'])}@{_escape_cell(manifest['base_sha'])}`",
        f"- Open PRs: **{manifest['open_pr_count']}**",
        f"- Authority note: {_escape_cell(manifest['authority_note'])}",
        "",
    ]

    prs_by_train: dict[str, list[dict[str, Any]]] = {}
    for raw_pr in pull_requests:
        assert isinstance(raw_pr, dict)
        train_name = str(raw_pr["initial_train"])
        prs_by_train.setdefault(train_name, []).append(raw_pr)

    for train_name in sorted(trains):
        raw_train = trains[train_name]
        assert isinstance(raw_train, dict)
        train_prs = sorted(prs_by_train.get(train_name, []), key=lambda item: int(item["number"]))
        lines.extend(
            [
                f"## {_escape_cell(train_name)} — {_escape_cell(raw_train['description'])}",
                "",
                f"Canonical issue: #{raw_train['issue']}",
                "",
                "| PR | Title | Disposition | Base | Exact head | Predecessors | Successor | Overlaps |",
                "| --- | --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        if not train_prs:
            lines.append("| — | — | — | — | — | — | — | — |")
        else:
            for pr in train_prs:
                number = int(pr["number"])
                url = str(pr["url"])
                base_ref = pr.get("base_ref")
                base_sha = pr.get("base_sha")
                base_cell = (
                    f"`{_escape_cell(base_ref)}@{_escape_cell(str(base_sha)[:12])}`"
                    if base_ref is not None and base_sha is not None
                    else "refresh required"
                )
                head_sha = pr.get("head_sha")
                head_cell = (
                    f"`{_escape_cell(str(head_sha)[:12])}`"
                    if head_sha is not None
                    else "refresh required"
                )
                successor = pr.get("successor_pr")
                successor_cell = f"#{successor}" if successor is not None else "—"
                lines.append(
                    "| "
                    f"[#{number}]({url}) | "
                    f"{_escape_cell(pr['title'])} | "
                    f"`{_escape_cell(pr['initial_disposition'])}` | "
                    f"{base_cell} | "
                    f"{head_cell} | "
                    f"{_pr_links(pr.get('predecessor_prs', []))} | "
                    f"{successor_cell} | "
                    f"{_pr_links(pr.get('overlap_prs', []))} |"
                )
        lines.append("")

    orphan_trains = sorted(set(prs_by_train) - set(trains))
    if orphan_trains:
        raise RenderError(f"validated manifest contains unknown train: {orphan_trains[0]}")

    return "\n".join(lines).rstrip() + "\n"


def write_human_view_atomic(content: str, path: Path = HUMAN_VIEW_PATH) -> None:
    """Publish generated Markdown atomically without following symlink authority."""
    if path.is_symlink():
        raise RenderError("human-view path must not be a symbolic link")
    temporary = path.with_name(f".{path.name}.tmp")
    if temporary.exists() or temporary.is_symlink():
        raise RenderError("temporary human-view path already exists")

    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except OSError as exc:
        raise RenderError(f"unable to publish human view: {type(exc).__name__}") from exc
    finally:
        if temporary.exists():
            temporary.unlink()


def _check_current(rendered: str, path: Path) -> bool:
    """Return whether the committed human view is byte-for-byte generated truth."""
    try:
        return path.read_text(encoding="utf-8") == rendered and not path.is_symlink()
    except (OSError, UnicodeError):
        return False


def main(argv: list[str] | None = None) -> int:
    """Render or verify the queue's generated human-readable projection."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the committed human view differs from the validated manifest",
    )
    args = parser.parse_args(argv)

    try:
        manifest = load_manifest(DEFAULT_MANIFEST_PATH)
        rendered = render_queue_markdown(manifest)
        if args.check:
            if not _check_current(rendered, HUMAN_VIEW_PATH):
                print("open PR queue human view is stale", file=sys.stderr)
                return 1
        else:
            write_human_view_atomic(rendered, HUMAN_VIEW_PATH)
    except (ManifestError, RenderError) as exc:
        print(f"open PR queue human-view generation failed: {exc}", file=sys.stderr)
        return 1

    print("open PR queue human view verified" if args.check else "open PR queue human view refreshed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
