"""Regression tests for effective Rust-toolchain Dependabot policy fields."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


def _job(name: str, *commands: str) -> str:
    """Return one minimal workflow job with executable run steps."""
    lines = [f"  {name}:", "    steps:"]
    lines.extend(f"      - run: {command}" for command in commands)
    return "\n".join(lines)


def test_rust_toolchain_policy_rejects_dependabot_fields_present_only_in_comments(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Comments inside the Rust lane cannot satisfy effective update policy."""
    verifier = load_module(
        "scripts/checks/verify_rust_toolchain.py",
        "verify_rust_toolchain_commented_dependabot_evidence",
    )
    version = verifier.EXPECTED_TOOLCHAIN
    toolchain_path = tmp_path / "rust-toolchain.toml"
    dependabot_path = tmp_path / ".github" / "dependabot.yml"
    workflows_path = tmp_path / ".github" / "workflows"
    dependabot_path.parent.mkdir(parents=True, exist_ok=True)
    workflows_path.mkdir(parents=True, exist_ok=True)

    toolchain_path.write_text(
        f'[toolchain]\nchannel = "{version}"\nprofile = "minimal"\n',
        encoding="utf-8",
    )
    dependabot_path.write_text(
        "version: 2\n"
        "updates:\n"
        '  - package-ecosystem: "rust-toolchain"\n'
        '    # directory: "/"\n'
        '    directory: "/wrong"\n'
        '    # target-branch: "develop"\n'
        '    target-branch: "main"\n'
        "    schedule:\n"
        '      # interval: "weekly"\n'
        '      interval: "monthly"\n',
        encoding="utf-8",
    )

    install = f"rustup toolchain install {version} --profile minimal"
    (workflows_path / "ci.yml").write_text(
        "jobs:\n"
        + _job("verify", install)
        + "\n"
        + _job(
            "rust-check",
            install,
            f"cargo +{version} check",
            f"cargo +{version} test",
        )
        + "\n",
        encoding="utf-8",
    )
    (workflows_path / "release.yml").write_text(
        "jobs:\n" + _job("release-preflight", install) + "\n",
        encoding="utf-8",
    )
    (workflows_path / "security-audit.yml").write_text(
        "jobs:\n"
        + _job(
            "audit",
            install,
            f"cargo +{version} install cargo-audit --locked",
            f"cargo +{version} audit",
        )
        + "\n",
        encoding="utf-8",
    )
    target = f"rustup target add test-target --toolchain {version}"
    (workflows_path / "build-baseline.yml").write_text(
        "jobs:\n"
        + "\n".join(
            _job(job_name, install, target)
            for job_name in (
                "build-windows-native",
                "build-windows-arm64",
                "build-macos-native",
                "build-macos-arm64",
            )
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(verifier, "RUST_TOOLCHAIN", toolchain_path)
    monkeypatch.setattr(verifier, "DEPENDABOT", dependabot_path)
    monkeypatch.setattr(verifier, "WORKFLOWS", workflows_path)

    assert verifier.main() == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Rust toolchain lane is missing" in captured.err
    assert "directory" in captured.err
    assert "target-branch" in captured.err
    assert "interval" in captured.err
