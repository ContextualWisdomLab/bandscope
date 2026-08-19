"""Regression tests for the repository Rust toolchain policy guard."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


def _supporting_workflow_contracts(version: str) -> dict[str, str]:
    """Return minimal fixtures for Rust-owning workflows outside ordinary CI."""
    install = f"rustup toolchain install {version} --profile minimal"
    return {
        "release.yml": install,
        "security-audit.yml": "\n".join(
            (
                install,
                f"cargo +{version} install cargo-audit --locked",
                f"cargo +{version} audit",
            )
        ),
        "build-baseline.yml": "\n".join(
            (install,) * 4
            + tuple(
                f"rustup target add target-{index} --toolchain {version}"
                for index in range(4)
            )
        ),
    }


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
    version = getattr(module, "EXPECTED_TOOLCHAIN")
    for filename, content in _supporting_workflow_contracts(version).items():
        (workflows_path / filename).write_text(content, encoding="utf-8")

    monkeypatch.setattr(module, "RUST_TOOLCHAIN", toolchain_path)
    monkeypatch.setattr(module, "DEPENDABOT", dependabot_path)
    monkeypatch.setattr(module, "WORKFLOWS", workflows_path)


def _complete_workflow_contract(version: str) -> str:
    """Return a minimal CI fixture containing its two reviewed compiler owners."""
    install = f"rustup toolchain install {version} --profile minimal"
    return "\n".join(
        (
            install,
            install,
            f"cargo +{version} check",
            f"cargo +{version} test",
        )
    )


def _complete_dependabot_contract() -> str:
    """Return one minimal, complete Rust toolchain Dependabot update lane."""
    return (
        "version: 2\n"
        "updates:\n"
        '  - package-ecosystem: "rust-toolchain"\n'
        '    directory: "/"\n'
        '    target-branch: "develop"\n'
        "    schedule:\n"
        '      interval: "weekly"\n'
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
        dependabot=_complete_dependabot_contract(),
        workflow=_complete_workflow_contract(version),
    )

    assert verifier.main() == 0
    captured = capsys.readouterr()
    assert captured.err == ""
    assert captured.out == f"Rust compiler contract is pinned to {version}.\n"


def test_rust_toolchain_policy_rejects_cross_lane_dependabot_evidence(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Unrelated update lanes cannot satisfy the Rust toolchain lane contract."""
    verifier = load_module(
        "scripts/checks/verify_rust_toolchain.py", "verify_rust_toolchain_cross_lane"
    )
    version = verifier.EXPECTED_TOOLCHAIN
    _configure_policy_fixture(
        verifier,
        monkeypatch,
        tmp_path,
        manifest=f'[toolchain]\nchannel = "{version}"\nprofile = "minimal"\n',
        dependabot=(
            "version: 2\n"
            "updates:\n"
            '  - package-ecosystem: "rust-toolchain"\n'
            '    directory: "/wrong"\n'
            '  - package-ecosystem: "npm"\n'
            '    directory: "/"\n'
            '    target-branch: "develop"\n'
            "    schedule:\n"
            '      interval: "weekly"\n'
        ),
        workflow=_complete_workflow_contract(version),
    )

    assert verifier.main() == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Rust toolchain lane is missing" in captured.err
    assert "directory" in captured.err
    assert "target-branch" in captured.err
    assert "interval" in captured.err


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
        "ci.yml must contain",
    ):
        assert expected in captured.err


def test_rust_toolchain_policy_rejects_compiler_evidence_borrowed_from_sibling_workflow(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A release lane cannot borrow its compiler pin from another workflow file."""
    verifier = load_module(
        "scripts/checks/verify_rust_toolchain.py", "verify_rust_toolchain_cross_workflow"
    )
    version = verifier.EXPECTED_TOOLCHAIN
    _configure_policy_fixture(
        verifier,
        monkeypatch,
        tmp_path,
        manifest=f'[toolchain]\nchannel = "{version}"\nprofile = "minimal"\n',
        dependabot=_complete_dependabot_contract(),
        workflow=_complete_workflow_contract(version),
    )
    (tmp_path / ".github" / "workflows" / "release.yml").write_text(
        "name: release\njobs:\n  release-preflight:\n    steps:\n      - run: echo no-rust-pin\n",
        encoding="utf-8",
    )

    assert verifier.main() == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "release.yml" in captured.err
    assert f"rustup toolchain install {version} --profile minimal" in captured.err
