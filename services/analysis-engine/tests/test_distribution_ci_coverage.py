"""Hosted-CI contracts for standalone Distribution Rust owners."""

from __future__ import annotations

from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parents[3]
_CI_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "ci.yml"


def test_hosted_ci_executes_every_standalone_distribution_owner() -> None:
    """Current-head CI must execute tests for each Distribution-owned Rust crate."""
    workflow = _CI_WORKFLOW.read_text(encoding="utf-8")
    manifests = (
        "apps/desktop/distribution-download/Cargo.toml",
        "apps/desktop/distribution-state/Cargo.toml",
        "apps/desktop/distribution-runtime/Cargo.toml",
        "apps/desktop/distribution-transport/Cargo.toml",
    )

    for manifest in manifests:
        command = f"cargo +stable test --manifest-path {manifest} --locked --all-targets"
        assert command in workflow, f"hosted CI does not execute {manifest}"

    assert "distribution-owned-platform" in workflow
    assert "- distribution-owned-platform" in workflow
