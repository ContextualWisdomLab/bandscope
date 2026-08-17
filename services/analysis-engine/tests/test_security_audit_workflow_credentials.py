"""Security-audit workflow credential-boundary regression tests."""

from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SECURITY_AUDIT_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "security-audit.yml"


def test_security_audit_checkout_does_not_persist_github_credentials() -> None:
    """Dependency lifecycle scripts must not inherit persisted checkout credentials."""
    workflow_text = SECURITY_AUDIT_WORKFLOW.read_text(encoding="utf-8")
    checkout_marker = (
        "- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0"
    )
    checkout_offset = workflow_text.index(checkout_marker)
    checkout_block = workflow_text[checkout_offset : checkout_offset + 240]

    assert "persist-credentials: false" in checkout_block
