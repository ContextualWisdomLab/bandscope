"""Regression tests for the repository Rust toolchain policy guard."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


def _configure_policy_fixture(
    module: object,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    *,
    manifest: str,
    dependabot: str,
    workflow: str,
) -> None:
    """Point one loaded verifier module at an isolated repository fixture."""
    toolchain_path = tmp_path / "rust-toolchain.toml"
    dependabot_path = tmp_path / ".github" / "dependabot.yml"
    workflows_path = tmp_path / ".github" / "workflows"
    dependabot_path.parent.mkdir(parents=True, exist_ok=True)
    workflows_path.mkdir(parents=True, exist_ok=True)
    toolchain_path.write_text(manifest, encoding="utf-8")
    dependabot_path.write_text(dependabot, encoding="utf-8")
    (workflows_path / "ci.yml").write_text(workflow, encoding="utf-8")

    monkeypatch.setattr(module, "RUST_TOOLCHAIN", toolchain_path)
    monkeypatch.setattr(module, "DEPENDABOT", dependabot_path)
    monkeypatch.setattr(module, "WORKFLOWS", workflows_path)


def _complete_workflow_contract(version: str) -> str:
    """Return a minimal workflow fixture containing every reviewed compiler token."""
    return "\n".join(
        (
            f"rustup toolchain install {version} --profile minimal",
            f"cargo +{version} check",
            f"cargo +{version} test",
            f"cargo +{version} install cargo-audit --locked",
            f"cargo +{version} audit",
            f"rustup target add x86_64-unknown-linux-gnu --toolchain {version}",
        )
    )


def test_rust_toolchain_policy_accepts_exact_reviewed_contract(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The verifier accepts one exact compiler pin and monitored update lane."""
    verifier = load_module(
        "scripts/checks/verify_rust_toolchain.py", "verify_rust_toolchain_success"
    )
    version = verifier.EXPECTED_TOOLCHAIN
    _configure_policy_fixture(
        verifier,
        monkeypatch,
        tmp_path,
        manifest=(
            "[toolchain]\n"
            f'channel = "{version}"\n'
            'profile = "minimal"\n'
            'components = ["rustfmt", "clippy"]\n'
        ),
        dependabot=(
            'package-ecosystem: "rust-toolchain"\n'
            'target-branch: "develop"\n'
            'interval: "weekly"\n'
        ),
        workflow=_complete_workflow_contract(version),
    )

    assert verifier.main() == 0
    captured = capsys.readouterr()
    assert captured.err == ""
    assert captured.out == f"Rust compiler contract is pinned to {version}.\n"


def test_rust_toolchain_policy_fails_closed_on_every_contract_drift(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Manifest, Dependabot, floating selectors, and command drift all fail closed."""
    verifier = load_module(
        "scripts/checks/verify_rust_toolchain.py", "verify_rust_toolchain_failure"
    )
    _configure_policy_fixture(
        verifier,
        monkeypatch,
        tmp_path,
        manifest='[toolchain]\nchannel = "stable"\nprofile = "default"\n',
        dependabot='package-ecosystem: "cargo"\n',
        workflow=(
            "rustup toolchain install stable\n"
            "cargo +stable check\n"
            "rustup target add x86_64-unknown-linux-gnu --toolchain stable\n"
        ),
    )

    assert verifier.main() == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    for expected in (
        "must pin channel",
        "must retain profile = 'minimal'",
        "Dependabot Rust toolchain lane is missing",
        "workflow still contains floating Rust selector",
        "workflow compiler contract is missing",
    ):
        assert expected in captured.err
