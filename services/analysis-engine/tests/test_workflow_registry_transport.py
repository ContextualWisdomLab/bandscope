"""Security regressions for workflow-registry transport boundaries."""

from __future__ import annotations

import urllib.request

import pytest
from conftest import load_module


def test_registry_client_rejects_non_https_request_target(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dynamic request target must never reach urllib's scheme-switching opener."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_transport_test",
    )
    client = audit.GitHubRegistryClient(api_url="https://api.github.com")
    transport_called = False

    def forbidden_urlopen(*_args, **_kwargs):
        nonlocal transport_called
        transport_called = True
        raise AssertionError("unsafe dynamic target reached urllib.request.urlopen")

    monkeypatch.setattr(urllib.request, "urlopen", forbidden_urlopen)

    with pytest.raises(audit.AuditError, match="request target must stay on the configured HTTPS API origin"):
        client._get_json("file:///etc/passwd")

    assert transport_called is False
