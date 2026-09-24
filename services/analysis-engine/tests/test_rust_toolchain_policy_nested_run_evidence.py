"""Regression tests for non-executable run-shaped Rust toolchain evidence."""

from __future__ import annotations

from conftest import load_module


def test_rust_toolchain_policy_rejects_required_command_in_nested_env_run_key() -> None:
    """A nested ``env.run`` value cannot satisfy executable Rust evidence."""
    verifier = load_module(
        "scripts/checks/verify_rust_toolchain.py",
        "verify_rust_toolchain_nested_run_evidence",
    )
    version = verifier.EXPECTED_TOOLCHAIN
    install = f"rustup toolchain install {version} --profile minimal"
    job = "\n".join(
        (
            "  owner:",
            "    steps:",
            "      - name: Pretend evidence",
            "        env:",
            f"          run: {install}",
            "        run: echo no-rust-toolchain-install",
        )
    )

    assert not verifier._job_runs_required_command(job, install)
