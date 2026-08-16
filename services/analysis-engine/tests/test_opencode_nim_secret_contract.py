"""Focused regression for forbidden OpenCode reasoning options."""

from __future__ import annotations

from pathlib import Path


def test_opencode_forbids_reasoning_effort_anywhere() -> None:
    """Reject OpenAI-style reasoningEffort anywhere in the local NIM config."""
    repo_root = Path(__file__).resolve().parents[3]
    opencode_text = (repo_root / "opencode.jsonc").read_text(encoding="utf-8")

    assert '"reasoningEffort"' not in opencode_text
