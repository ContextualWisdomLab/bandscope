"""Security regressions for the workflow-registry API credential boundary."""

from __future__ import annotations

import pytest
from conftest import load_module


def _load_audit_module():
    """Load the repository-owned workflow registry auditor."""
    return load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_api_origin_test",
    )


def test_token_cannot_be_sent_to_an_arbitrary_https_api_origin() -> None:
    """A bearer token must never follow a caller-controlled HTTPS API origin."""
    audit_module = _load_audit_module()

    with pytest.raises(audit_module.AuditError, match="token-bearing api_url"):
        audit_module.GitHubRegistryClient(
            api_url="https://attacker.invalid",
            token="github-token-must-not-leave-github",
        )
