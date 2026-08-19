"""Supply-chain regressions for the repository-pinned Rust audit toolchain."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


PINNED_RUST_AUDIT = "cargo +1.97.1 audit"


def _security_audit_workflow(rust_audit_command: str) -> str:
    """Return the smallest blocking workflow that exercises all audit families."""
    return f"""
name: security-audit
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - run: npm audit --workspaces --audit-level=high
      - run: pip-audit --local --strict
      - run: {rust_audit_command}
""".strip()


def _rust_audit_violations(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    rust_audit_command: str,
) -> list[str]:
    """Run only the security-audit coverage verifier against one isolated workflow."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        f"verify_supply_chain_rust_audit_{rust_audit_command.replace(' ', '_').replace('+', '')}",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        _security_audit_workflow(rust_audit_command),
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    violations: list[str] = []
    supply_chain._verify_security_audit_coverage(violations)
    return violations


def test_supply_chain_accepts_repository_pinned_rust_audit(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """The pinned audit command must satisfy the security workflow contract."""
    violations = _rust_audit_violations(monkeypatch, tmp_path, PINNED_RUST_AUDIT)

    assert not any("missing vulnerability audit token" in item for item in violations)


def test_supply_chain_rejects_floating_stable_rust_audit(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A floating stable selector cannot satisfy the exact Rust audit contract."""
    violations = _rust_audit_violations(monkeypatch, tmp_path, "cargo +stable audit")

    assert (
        "security audit workflow missing vulnerability audit token: " + PINNED_RUST_AUDIT
    ) in violations
