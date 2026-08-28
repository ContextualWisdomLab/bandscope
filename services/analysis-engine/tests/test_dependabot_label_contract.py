"""Regression contract for Dependabot's configured repository labels."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEPENDABOT_CONFIG = REPO_ROOT / ".github" / "dependabot.yml"


def test_github_actions_updates_use_repository_ci_cd_taxonomy() -> None:
    """Keep GitHub Actions updates on an existing CI/CD taxonomy label."""
    config = DEPENDABOT_CONFIG.read_text(encoding="utf-8")
    github_actions = config.split('package-ecosystem: "github-actions"', maxsplit=1)[1]

    assert '- "area: ci-cd"' in github_actions
    assert '- "github-actions"' not in github_actions
