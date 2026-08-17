"""Regression tests for the supported Node.js and jsdom compatibility floor."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXPECTED_NODE_ENGINE = ">=22.22.2 <23"
EXPECTED_NODE_FLOOR = (22, 22, 2)
EXPECTED_NPM_VERSION = "10.9.8"
EXPECTED_JSDOM_RANGE = "^30.0.1"


def _load_json(path: str) -> dict[str, object]:
    """Load one repository JSON file for an exact contract assertion."""
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def _supports_band_node(version: tuple[int, int, int]) -> bool:
    """Model the deliberately narrow supported Node 22 patch interval."""
    return EXPECTED_NODE_FLOOR <= version < (23, 0, 0)


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
    assert package_lock["packages"]["apps/desktop"]["devDependencies"]["jsdom"] == EXPECTED_JSDOM_RANGE
    assert package_lock["packages"]["node_modules/jsdom"]["version"] == "30.0.1"


def test_minimum_node_lane_runs_complete_suite_with_pinned_npm() -> None:
    """Exercise the exact Node floor after bootstrapping the canonical npm generator."""
    workflow = (ROOT / ".github/workflows/node-minimum-compatibility.yml").read_text(encoding="utf-8")

    match = re.search(
        r"(?ms)^  node-minimum-compatibility:\n(?P<body>.*?)(?=^  [a-zA-Z0-9_-]+:\n|\Z)",
        workflow,
    )
    assert match is not None, "minimum-version workflow must define node-minimum-compatibility"
    body = match.group("body")

    required_fragments = (
        "node-version: 22.22.2",
        "package-manager-cache: false",
        f'EXPECTED_NPM_VERSION: "{EXPECTED_NPM_VERSION}"',
        'npm install --global "npm@$EXPECTED_NPM_VERSION" --ignore-scripts --no-audit --no-fund',
        'test "$(npm --version)" = "$EXPECTED_NPM_VERSION"',
        "npm ci",
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

    setup_node = body.split("- uses: actions/setup-node@", maxsplit=1)[1].split(
        "- name: Bootstrap exact repository npm generator", maxsplit=1
    )[0]
    assert "cache: npm" not in setup_node, (
        "setup-node must not invoke bundled npm cache discovery before npm 10.9.8 is bootstrapped"
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
        if "22.13" in (ROOT / path).read_text(encoding="utf-8")
    ]
    assert stale == []
