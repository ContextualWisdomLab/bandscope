"""Dependency-workflow checkout credential-boundary regression tests."""

from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CHECKOUT_MARKER = (
    "- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0"
)
DEPENDENCY_LIFECYCLE_WORKFLOWS = (
    ".github/workflows/security-audit.yml",
    ".github/workflows/release.yml",
    ".github/workflows/bandit.yml",
)


def _checkout_step(workflow_text: str) -> str:
    """Return the first checkout step without accepting options from later steps."""
    checkout_offset = workflow_text.index(CHECKOUT_MARKER)
    checkout_tail = workflow_text[checkout_offset:]
    next_step_offset = checkout_tail.find("\n      - ", len(CHECKOUT_MARKER))
    if next_step_offset == -1:
        return checkout_tail
    return checkout_tail[:next_step_offset]


def test_dependency_workflow_checkout_does_not_persist_github_credentials() -> None:
    """Dependency lifecycle code must not inherit persisted checkout credentials."""
    for workflow_path in DEPENDENCY_LIFECYCLE_WORKFLOWS:
        workflow_text = (REPOSITORY_ROOT / workflow_path).read_text(encoding="utf-8")
        checkout_step = _checkout_step(workflow_text)

        assert "persist-credentials: false" in checkout_step, workflow_path


def test_checkout_step_does_not_accept_credentials_from_a_later_step() -> None:
    """A later step option must not satisfy the checkout credential contract."""
    workflow_text = f"""steps:
      {CHECKOUT_MARKER}
      - uses: actions/setup-node@example
        with:
          persist-credentials: false
"""

    assert "persist-credentials: false" not in _checkout_step(workflow_text)
