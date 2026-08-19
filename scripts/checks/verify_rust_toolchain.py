#!/usr/bin/env python3
"""Fail closed when BandScope Rust workflows drift from the reviewed compiler."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RUST_TOOLCHAIN = REPOSITORY_ROOT / "rust-toolchain.toml"
DEPENDABOT = REPOSITORY_ROOT / ".github" / "dependabot.yml"
WORKFLOWS = REPOSITORY_ROOT / ".github" / "workflows"
EXPECTED_TOOLCHAIN = "1.97.1"
FLOATING_PATTERNS = (
    "rustup toolchain install stable",
    "cargo +stable",
    "--toolchain stable",
)
DEPENDABOT_LANE_MARKER = '  - package-ecosystem: "rust-toolchain"'
DEPENDABOT_UPDATE_MARKER = "  - package-ecosystem:"


def _error(message: str) -> None:
    """Write one policy violation to stderr."""
    print(f"rust-toolchain-contract: {message}", file=sys.stderr)


def _rust_toolchain_dependabot_lane(content: str) -> str | None:
    """Return the single Rust toolchain update lane without borrowing sibling fields."""
    lines = content.splitlines()
    starts = [index for index, line in enumerate(lines) if line == DEPENDABOT_LANE_MARKER]
    if len(starts) != 1:
        return None

    start = starts[0]
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if lines[index].startswith(DEPENDABOT_UPDATE_MARKER):
            end = index
            break
    return "\n".join(lines[start:end])


def main() -> int:
    """Validate the root manifest, update lane, and every executable workflow."""

    failures = 0
    manifest = tomllib.loads(RUST_TOOLCHAIN.read_text(encoding="utf-8"))
    toolchain = manifest.get("toolchain", {})
    if toolchain.get("channel") != EXPECTED_TOOLCHAIN:
        _error(
            "rust-toolchain.toml must pin channel "
            f"{EXPECTED_TOOLCHAIN}, found {toolchain.get('channel')!r}"
        )
        failures += 1
    if toolchain.get("profile") != "minimal":
        _error("rust-toolchain.toml must retain profile = 'minimal'")
        failures += 1

    dependabot = DEPENDABOT.read_text(encoding="utf-8")
    dependabot_lane = _rust_toolchain_dependabot_lane(dependabot)
    if dependabot_lane is None:
        _error("Dependabot Rust toolchain lane is missing or duplicated")
        failures += 1
    else:
        for required in (
            'directory: "/"',
            'target-branch: "develop"',
            'interval: "weekly"',
        ):
            if required not in dependabot_lane:
                _error(f"Dependabot Rust toolchain lane is missing {required!r}")
                failures += 1

    workflow_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")))
    )
    for pattern in FLOATING_PATTERNS:
        if pattern in workflow_text:
            _error(f"workflow still contains floating Rust selector {pattern!r}")
            failures += 1

    expected_commands = (
        f"rustup toolchain install {EXPECTED_TOOLCHAIN} --profile minimal",
        f"cargo +{EXPECTED_TOOLCHAIN} check",
        f"cargo +{EXPECTED_TOOLCHAIN} test",
        f"cargo +{EXPECTED_TOOLCHAIN} install cargo-audit --locked",
        f"cargo +{EXPECTED_TOOLCHAIN} audit",
        f"--toolchain {EXPECTED_TOOLCHAIN}",
    )
    for command in expected_commands:
        if command not in workflow_text:
            _error(f"workflow compiler contract is missing {command!r}")
            failures += 1

    if failures:
        return 1
    print(f"Rust compiler contract is pinned to {EXPECTED_TOOLCHAIN}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
