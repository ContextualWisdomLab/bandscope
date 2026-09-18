"""Regression tests for the supported Node.js and jsdom compatibility floor."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXPECTED_NODE_ENGINE = ">=22.22.2 <23"
EXPECTED_NODE_FLOOR = (22, 22, 2)
EXPECTED_NPM_VERSION = "10.9.9"
EXPECTED_JSDOM_RANGE = "^30.0.1"
EXPECTED_ESLINT_RANGE = "^10.9.1"
CANONICAL_NPM_ACTIVATION = "bash scripts/checks/activate_pinned_npm_runtime.sh"


def _load_json(path: str) -> dict[str, object]:
    """Load one repository JSON file for an exact contract assertion."""
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def _supports_band_node(version: tuple[int, int, int]) -> bool:
    """Model the deliberately narrow supported Node 22 patch interval."""
    return EXPECTED_NODE_FLOOR <= version < (23, 0, 0)


def _workflow_job(workflow: str, job_name: str) -> str:
    """Return one top-level workflow job body for structural contract checks."""
    match = re.search(
        rf"(?ms)^  {re.escape(job_name)}:\n(?P<body>.*?)(?=^  [a-zA-Z0-9_-]+:\n|\Z)",
        workflow,
    )
    assert match is not None, f"workflow must define {job_name}"
    return match.group("body")


def test_node_engine_floor_matches_jsdom_30_runtime_contract() -> None:
    """Root manifest and lock metadata must publish the same Node compatibility floor."""
    package = _load_json("package.json")
    package_lock = _load_json("package-lock.json")

    assert package["engines"] == {"node": EXPECTED_NODE_ENGINE}
    assert package["packageManager"] == f"npm@{EXPECTED_NPM_VERSION}"
    assert package_lock["packages"][""]["engines"] == {"node": EXPECTED_NODE_ENGINE}


def test_node_floor_rejects_pre_floor_patch_and_accepts_exact_minimum() -> None:
    """Node 22.22.1 is unsupported while the exact 22.22.2 floor is supported."""
    assert not _supports_band_node((22, 22, 1))
    assert _supports_band_node((22, 22, 2))
    assert _supports_band_node((22, 99, 0))
    assert not _supports_band_node((23, 0, 0))


def test_jsdom_30_is_adopted_in_manifest_and_lock() -> None:
    """The coordinated compatibility slice must carry jsdom 30 in both package graphs."""
    desktop = _load_json("apps/desktop/package.json")
    package_lock = _load_json("package-lock.json")

    assert desktop["devDependencies"]["jsdom"] == EXPECTED_JSDOM_RANGE
    assert (
        package_lock["packages"]["apps/desktop"]["devDependencies"]["jsdom"] == EXPECTED_JSDOM_RANGE
    )
    assert package_lock["packages"]["apps/desktop/node_modules/jsdom"]["version"] == "30.0.1"


def test_eslint_10_9_1_intent_is_preserved_in_both_workspaces_and_lock() -> None:
    """The canonical lock owner must preserve the reviewed ESLint dependency intent."""
    desktop = _load_json("apps/desktop/package.json")
    shared_types = _load_json("packages/shared-types/package.json")
    package_lock = _load_json("package-lock.json")

    assert desktop["devDependencies"]["eslint"] == EXPECTED_ESLINT_RANGE
    assert shared_types["devDependencies"]["eslint"] == EXPECTED_ESLINT_RANGE
    assert (
        package_lock["packages"]["apps/desktop"]["devDependencies"]["eslint"]
        == EXPECTED_ESLINT_RANGE
    )
    assert (
        package_lock["packages"]["packages/shared-types"]["devDependencies"]["eslint"]
        == EXPECTED_ESLINT_RANGE
    )


def test_minimum_node_lane_runs_in_registered_ci_with_pinned_npm() -> None:
    """Exercise the exact Node floor inside the already-registered CI workflow."""
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    standalone = ROOT / ".github/workflows/node-minimum-compatibility.yml"

    assert not standalone.exists(), (
        "the exact-minimum lane belongs in registered ci.yml, not a second workflow owner"
    )

    body = _workflow_job(workflow, "node-minimum-compatibility")
    required_fragments = (
        "node-version: 22.22.2",
        "package-manager-cache: false",
        CANONICAL_NPM_ACTIVATION,
        "npm ci --ignore-scripts --no-audit --no-fund",
        "npm run lint",
        "npm run typecheck",
        "npm run test",
        "npm run build",
        "npm run build-storybook --workspace @bandscope/desktop",
        "cargo +stable check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked",
        "cargo +stable test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked",
    )
    for fragment in required_fragments:
        assert fragment in body, f"minimum-version job is missing: {fragment}"

    for mutable_command in ("npm install ", "npm update ", "npx "):
        assert mutable_command not in body, (
            "minimum-version workflow must not resolve dependencies mutably: "
            f"{mutable_command.strip()}"
        )


def test_all_registered_ci_npm_consumers_delegate_activation_to_helper() -> None:
    """Keep one fail-closed npm acquisition policy across every CI consumer."""
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    for job_name in (
        "lock-validation",
        "verify",
        "rust-check",
        "node-minimum-compatibility",
    ):
        body = _workflow_job(workflow, job_name)
        assert body.count(CANONICAL_NPM_ACTIVATION) == 1, (
            f"{job_name} must delegate npm activation exactly once to the canonical helper"
        )
        for duplicate_activation in ("corepack enable npm", "npm --version"):
            assert duplicate_activation not in body, (
                f"{job_name} must not retain workflow-local npm activation: {duplicate_activation}"
            )

        activation_offset = body.index(CANONICAL_NPM_ACTIVATION)
        install_offset = body.index("npm ci")
        assert activation_offset < install_offset, (
            f"{job_name} must verify the exact npm runtime before frozen dependency admission"
        )


def test_repository_no_longer_advertises_node_22_13_floor() -> None:
    """Canonical runtime/build documentation must not retain the superseded 22.13 floor."""
    audited_paths = (
        "package.json",
        "package-lock.json",
        "README.md",
        "CONTRIBUTING.md",
        "CLAUDE.md",
        "docs/engineering/harness-engineering.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/operations/deploy-runbook.md",
    )

    stale = [
        path
        for path in audited_paths
        if path != "package-lock.json" and "22.13" in (ROOT / path).read_text(encoding="utf-8")
    ]
    package_lock = _load_json("package-lock.json")
    if package_lock["packages"][""]["engines"] != {"node": EXPECTED_NODE_ENGINE}:
        stale.append("package-lock.json#packages[''].engines")
    assert stale == []
