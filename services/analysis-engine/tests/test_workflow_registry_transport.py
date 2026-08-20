"""Security regressions for workflow-registry transport boundaries."""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from typing import Any

import pytest
from conftest import load_module


@dataclass
class _FakeResponse:
    """Minimal bounded HTTP response used by transport tests."""

    status: int
    data: bytes = b"{}"

    def read(self, amount: int | None = None, **_kwargs: Any) -> bytes:
        """Return at most *amount* bytes, matching urllib3's streaming response contract."""
        if amount is None:
            return self.data
        return self.data[:amount]


class _FakePool:
    """Minimal fixed-origin HTTPS pool fixture that never touches the network."""

    response = _FakeResponse(200)
    requests: list[tuple[str, str, dict[str, Any]]] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self.closed = False

    def request(self, method: str, target: str, **kwargs: Any) -> _FakeResponse:
        type(self).requests.append((method, target, kwargs))
        return type(self).response

    def close(self) -> None:
        self.closed = True


def _load_audit():
    return load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_transport_test",
    )


def test_registry_client_rejects_non_https_request_target(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dynamic request target must never reach urllib's scheme-switching opener."""
    audit = _load_audit()
    client = audit.GitHubRegistryClient(api_url="https://api.github.com")
    transport_called = False

    def forbidden_urlopen(*_args, **_kwargs):
        nonlocal transport_called
        transport_called = True
        raise AssertionError("unsafe dynamic target reached urllib.request.urlopen")

    monkeypatch.setattr(urllib.request, "urlopen", forbidden_urlopen)

    with pytest.raises(
        audit.AuditError,
        match="request target must stay on the configured HTTPS API origin",
    ):
        client._get_json("file:///etc/passwd")

    assert transport_called is False


def test_registry_client_rejects_cross_origin_target(monkeypatch: pytest.MonkeyPatch) -> None:
    """A request cannot leave the configured GitHub API origin."""
    audit = _load_audit()
    monkeypatch.setattr(audit.urllib3, "HTTPSConnectionPool", _FakePool)
    client = audit.GitHubRegistryClient(api_url="https://api.github.com")
    _FakePool.requests.clear()

    with pytest.raises(
        audit.AuditError,
        match="request target must stay on the configured HTTPS API origin",
    ):
        client._get_json("https://example.invalid/repos/ContextualWisdomLab/bandscope")

    assert _FakePool.requests == []


@pytest.mark.parametrize("status", [403, 404, 500, 503])
def test_registry_client_fails_closed_on_api_error_status(
    monkeypatch: pytest.MonkeyPatch,
    status: int,
) -> None:
    """Permission loss and transient API failures never become clean inventory evidence."""
    audit = _load_audit()
    monkeypatch.setattr(audit.urllib3, "HTTPSConnectionPool", _FakePool)
    _FakePool.response = _FakeResponse(status)
    _FakePool.requests.clear()
    client = audit.GitHubRegistryClient(api_url="https://api.github.com")

    with pytest.raises(audit.AuditError, match=rf"unexpected HTTP {status}"):
        client._get_json(
            "https://api.github.com/repos/ContextualWisdomLab/bandscope/actions/workflows"
        )

    method, _target, options = _FakePool.requests[0]
    assert method == "GET"
    assert options["redirect"] is False
    assert options["retries"] is False


def test_registry_client_rejects_oversized_success_body_before_json_parse(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A successful API response cannot allocate an unbounded JSON body."""
    audit = _load_audit()
    monkeypatch.setattr(audit.urllib3, "HTTPSConnectionPool", _FakePool)
    _FakePool.response = _FakeResponse(
        200,
        b'{"pad":"' + b"x" * (8 * 1024 * 1024 + 1) + b'"}',
    )
    _FakePool.requests.clear()
    client = audit.GitHubRegistryClient(api_url="https://api.github.com")

    with pytest.raises(
        audit.AuditError,
        match="GitHub API response exceeded the 8 MiB safety limit",
    ):
        client._get_json(
            "https://api.github.com/repos/ContextualWisdomLab/bandscope/git/trees/deadbeef?recursive=1"
        )


def test_registry_client_preserves_ghe_api_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    """A GitHub Enterprise API prefix is retained and path escape is rejected."""
    audit = _load_audit()
    monkeypatch.setattr(audit.urllib3, "HTTPSConnectionPool", _FakePool)
    _FakePool.response = _FakeResponse(200, b'{"ok": true}')
    _FakePool.requests.clear()
    client = audit.GitHubRegistryClient(api_url="https://github.example/api/v3")

    payload, status = client._get_json("https://github.example/api/v3/repos/owner/repo")

    assert status == 200
    assert payload == {"ok": True}
    assert _FakePool.requests[0][1] == "/api/v3/repos/owner/repo"
    assert _FakePool.requests[0][2]["redirect"] is False
    with pytest.raises(
        audit.AuditError,
        match="request target must stay on the configured HTTPS API origin",
    ):
        client._get_json("https://github.example/repos/owner/repo")
