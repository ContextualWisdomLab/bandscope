"""Regression tests for the generated human view of the BandScope merge-train queue."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
RENDERER_PATH = REPO_ROOT / "scripts" / "checks" / "render_open_pr_queue.py"


def _load_renderer() -> ModuleType:
    """Load the queue renderer without requiring scripts to be a Python package."""
    sys.path.insert(0, str(RENDERER_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location("render_open_pr_queue", RENDERER_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _manifest() -> dict[str, object]:
    """Return a minimal valid queue with two trains and one stack edge."""
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-09-01",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": "a" * 40,
        "open_pr_count": 2,
        "authority_note": (
            "Generated from a complete live GitHub open-PR inventory. Refresh checks, reviews, "
            "threads, ancestry, and writer evidence immediately before action."
        ),
        "trains": {
            "T0": {"description": "Dependency | base <unsafe>", "issue": 966},
            "T3": {"description": "Active player", "issue": 961},
        },
        "pull_requests": [
            {
                "number": 968,
                "title": "queue | renderer <script>",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/968",
                "initial_train": "T0",
                "initial_disposition": "product_readiness_baseline_program",
                "base_ref": "develop",
                "base_sha": "a" * 40,
                "head_sha": "b" * 40,
                "head_sha_status": "exact_current_head",
                "predecessor_prs": [],
                "overlap_prs": [971],
                "successor_pr": 971,
            },
            {
                "number": 971,
                "title": "player loop",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/971",
                "initial_train": "T3",
                "initial_disposition": "player_first_section_loop",
                "base_ref": "develop",
                "base_sha": "a" * 40,
                "head_sha": "c" * 40,
                "head_sha_status": "exact_current_head",
                "predecessor_prs": [968],
                "overlap_prs": [968],
                "successor_pr": None,
            },
        ],
    }


def test_render_queue_markdown_is_deterministic_complete_and_capture_scoped() -> None:
    """Every manifest PR appears once without turning routing evidence into readiness evidence."""
    renderer = _load_renderer()

    rendered = renderer.render_queue_markdown(_manifest())

    assert rendered == renderer.render_queue_markdown(_manifest())
    assert "BandScope open PR merge-train view" in rendered
    assert "capture-time routing evidence" in rendered
    assert "develop@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" in rendered
    assert "Open PRs: **2**" in rendered
    assert rendered.count("[#968](https://github.com/ContextualWisdomLab/bandscope/pull/968)") == 1
    assert rendered.count("[#971](https://github.com/ContextualWisdomLab/bandscope/pull/971)") == 1
    assert "Dependency \\| base &lt;unsafe&gt;" in rendered
    assert "queue \\| renderer &lt;script&gt;" in rendered
    assert "`bbbbbbbbbbbb`" in rendered
    assert "#968" in rendered
    assert "#971" in rendered
    assert "Refresh exact-head checks, reviews, unresolved threads, ancestry, mergeability" in rendered


def test_render_queue_markdown_rejects_invalid_manifest_before_rendering() -> None:
    """The human view cannot normalize or hide a malformed machine-readable queue."""
    renderer = _load_renderer()
    manifest = _manifest()
    manifest["open_pr_count"] = 3

    with pytest.raises(renderer.ManifestError, match="open_pr_count"):
        renderer.render_queue_markdown(manifest)


def test_write_human_view_atomic_rejects_symlink_authority(
    tmp_path: Path,
) -> None:
    """Generated documentation must not follow a repository-path symlink."""
    renderer = _load_renderer()
    target = tmp_path / "open-pr-queue.md"
    outside = tmp_path / "outside.md"
    outside.write_text("sentinel", encoding="utf-8")
    try:
        target.symlink_to(outside)
    except OSError:
        pytest.skip("symlink creation is unavailable on this platform")

    with pytest.raises(renderer.RenderError, match="symbolic link"):
        renderer.write_human_view_atomic("replacement\n", target)

    assert outside.read_text(encoding="utf-8") == "sentinel"


def test_write_human_view_atomic_rejects_preexisting_temporary_path(tmp_path: Path) -> None:
    """A stale or attacker-controlled temporary file fails closed instead of being reused."""
    renderer = _load_renderer()
    target = tmp_path / "open-pr-queue.md"
    temporary = tmp_path / ".open-pr-queue.md.tmp"
    temporary.write_text("occupied", encoding="utf-8")

    with pytest.raises(renderer.RenderError, match="temporary human-view path"):
        renderer.write_human_view_atomic("replacement\n", target)

    assert not target.exists()
    assert temporary.read_text(encoding="utf-8") == "occupied"
