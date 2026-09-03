"""Executable queue-shaping contracts for Dependabot update proposals."""

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


def _group_block(ecosystem_block: str, name: str) -> str:
    """Return one group body, stopping only at the next six-space sibling key."""
    marker = f"      {name}:"
    if marker not in ecosystem_block:
        raise AssertionError(f"Dependabot group is missing: {name}")
    group = ecosystem_block.split(marker, 1)[1]
    lines = group.splitlines()
    body: list[str] = []
    for line in lines:
        if line.startswith("      ") and not line.startswith("        "):
            break
        body.append(line)
    return "\n".join(body)


def test_npm_development_nonmajor_updates_are_grouped() -> None:
    """Keep routine npm tooling updates from recreating one-PR-per-package fanout."""
    block = _ecosystem_block("npm")
    group = _group_block(block, "npm-development-nonmajor")

    assert '        dependency-type: "development"' in group
    assert "        update-types:" in group
    assert '          - "minor"' in group
    assert '          - "patch"' in group
    assert '          - "major"' not in group
    assert "        patterns:" in group
    assert '          - "*"' in group


def test_github_actions_version_updates_remain_grouped() -> None:
    """Keep action version updates consolidated inside their ecosystem boundary."""
    block = _ecosystem_block("github-actions")
    group = _group_block(block, "github-actions")

    assert '        applies-to: "version-updates"' in group
    assert "        patterns:" in group
    assert '          - "*"' in group


def test_github_actions_security_updates_are_grouped_separately() -> None:
    """Consolidate action security updates without mixing them with version updates."""
    block = _ecosystem_block("github-actions")
    group = _group_block(block, "github-actions-security")

    assert '        applies-to: "security-updates"' in group
    assert "        patterns:" in group
    assert '          - "*"' in group
