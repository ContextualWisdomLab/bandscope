"""Executable queue-shaping contracts for Dependabot version updates."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
DEPENDABOT_CONFIG = REPO_ROOT / ".github" / "dependabot.yml"


def _ecosystem_block(name: str) -> str:
    """Return one Dependabot ecosystem block without parsing unrelated YAML."""
    content = DEPENDABOT_CONFIG.read_text(encoding="utf-8")
    marker = f'  - package-ecosystem: "{name}"'
    if marker not in content:
        raise AssertionError(f"Dependabot ecosystem is missing: {name}")
    start = content.index(marker)
    next_start = content.find("\n  - package-ecosystem:", start + len(marker))
    return content[start:] if next_start == -1 else content[start:next_start]


def test_npm_development_nonmajor_updates_are_grouped() -> None:
    """Keep routine npm tooling updates from recreating one-PR-per-package fanout."""
    block = _ecosystem_block("npm")
    marker = "      npm-development-nonmajor:"

    assert marker in block
    group = block.split(marker, 1)[1]
    assert '        dependency-type: "development"' in group
    assert "        update-types:" in group
    assert '          - "minor"' in group
    assert '          - "patch"' in group
    assert '          - "major"' not in group
    assert "        patterns:" in group
    assert '          - "*"' in group


def test_github_actions_updates_remain_grouped() -> None:
    """Keep action updates consolidated inside their existing ecosystem boundary."""
    block = _ecosystem_block("github-actions")

    assert "      github-actions:" in block
    assert "        patterns:" in block
    assert '          - "*"' in block
