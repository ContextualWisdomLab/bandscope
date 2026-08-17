"""Regression tests for the reproducible Cursor Cloud Agent bootstrap."""

from __future__ import annotations

import json
from pathlib import Path


def test_cloud_agent_install_uses_pinned_locked_dependency_bootstrap() -> None:
    """Keep Cloud Agent dependency setup aligned with BandScope's locked CI path."""
    repo_root = Path(__file__).resolve().parents[3]
    environment = json.loads(
        (repo_root / ".cursor" / "environment.json").read_text(encoding="utf-8")
    )
    install = environment["install"]

    assert "https://astral.sh/uv/0.8.6/install.sh" in install
    assert 'UV_UNMANAGED_INSTALL="$HOME/.local/bin"' in install
    assert "npm ci" in install
    assert "npm install" not in install
    assert "uv sync --project services/analysis-engine --group dev --frozen" in install
