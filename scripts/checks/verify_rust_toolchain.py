#!/usr/bin/env python3
"""Fail closed when BandScope Rust workflows drift from the reviewed compiler."""

from __future__ import annotations

import shlex
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
SHELL_CONTROL_CHARACTERS = frozenset("|&;")


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


def _workflow_job(content: str, job_name: str) -> str | None:
    """Return one exact top-level workflow job so sibling jobs cannot lend evidence."""
    lines = content.splitlines()
    marker = f"  {job_name}:"
    starts = [index for index, line in enumerate(lines) if line == marker]
    if len(starts) != 1:
        return None

    start = starts[0]
    end = len(lines)
    for index in range(start + 1, len(lines)):
        line = lines[index]
        if line.startswith("  ") and not line.startswith("    ") and line.endswith(":"):
            end = index
            break
    return "\n".join(lines[start:end])


def _inline_run_commands(job: str) -> tuple[str, ...]:
    """Return executable inline ``run:`` payloads from one workflow job.

    Required compiler evidence deliberately stays on one-line ``run:`` steps. A
    comment, step name, environment value, or multiline scalar cannot satisfy
    the contract accidentally; changing that representation requires an
    explicit verifier update and regression rather than silently broadening the
    evidence boundary.
    """
    commands: list[str] = []
    for line in job.splitlines():
        stripped = line.strip()
        if stripped.startswith("- run:"):
            command = stripped.removeprefix("- run:").strip()
        elif stripped.startswith("run:"):
            command = stripped.removeprefix("run:").strip()
        else:
            continue
        if command and command not in {"|", ">", "|-", ">-"}:
            commands.append(command)
    return tuple(commands)


def _is_single_shell_command(command: str) -> bool:
    """Return whether a run payload has no shell control operator.

    A required Rust command may carry ordinary arguments such as
    ``--manifest-path`` or ``--locked``. It may not be chained, piped, or
    backgrounded, because a later command could replace the required command's
    exit status and manufacture passing policy evidence.
    """
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars="|&;")
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = tuple(lexer)
    except ValueError:
        return False
    return bool(tokens) and not any(
        token and all(character in SHELL_CONTROL_CHARACTERS for character in token)
        for token in tokens
    )


def _job_runs_required_command(job: str, required: str) -> bool:
    """Return whether one unmasked executable run step owns the Rust evidence."""
    commands = tuple(
        command for command in _inline_run_commands(job) if _is_single_shell_command(command)
    )
    if required.startswith("--toolchain "):
        return any(
            command.startswith("rustup target add ") and required in command
            for command in commands
        )
    return any(
        command == required or command.startswith(f"{required} ")
        for command in commands
    )


def _required_workflow_jobs() -> dict[str, dict[str, tuple[str, ...]]]:
    """Return compiler evidence required from each job that owns Rust execution."""
    install = f"rustup toolchain install {EXPECTED_TOOLCHAIN} --profile minimal"
    target = f"--toolchain {EXPECTED_TOOLCHAIN}"
    return {
        "ci.yml": {
            "verify": (install,),
            "rust-check": (
                install,
                f"cargo +{EXPECTED_TOOLCHAIN} check",
                f"cargo +{EXPECTED_TOOLCHAIN} test",
            ),
        },
        "release.yml": {"release-preflight": (install,)},
        "security-audit.yml": {
            "audit": (
                install,
                f"cargo +{EXPECTED_TOOLCHAIN} install cargo-audit --locked",
                f"cargo +{EXPECTED_TOOLCHAIN} audit",
            )
        },
        "build-baseline.yml": {
            "build-windows-native": (install, target),
            "build-windows-arm64": (install, target),
            "build-macos-native": (install, target),
            "build-macos-arm64": (install, target),
        },
    }


def main() -> int:
    """Validate the root manifest, update lane, and every Rust-owning workflow job."""

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
        lane_lines = set(dependabot_lane.splitlines())
        for label, required_line in (
            ('directory: "/"', '    directory: "/"'),
            ('target-branch: "develop"', '    target-branch: "develop"'),
            ('interval: "weekly"', '      interval: "weekly"'),
        ):
            if required_line not in lane_lines:
                _error(f"Dependabot Rust toolchain lane is missing {label!r}")
                failures += 1

    workflow_paths = sorted((*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")))
    workflow_text = "\n".join(path.read_text(encoding="utf-8") for path in workflow_paths)
    for pattern in FLOATING_PATTERNS:
        if pattern in workflow_text:
            _error(f"workflow still contains floating Rust selector {pattern!r}")
            failures += 1

    for filename, job_requirements in _required_workflow_jobs().items():
        path = WORKFLOWS / filename
        if not path.is_file():
            _error(f"required Rust workflow {filename!r} is missing")
            failures += 1
            continue
        content = path.read_text(encoding="utf-8")
        for job_name, requirements in job_requirements.items():
            job = _workflow_job(content, job_name)
            if job is None:
                _error(f"{filename} is missing unique Rust-owning job {job_name!r}")
                failures += 1
                continue
            for command in requirements:
                if not _job_runs_required_command(job, command):
                    _error(f"{filename} job {job_name!r} is missing {command!r}")
                    failures += 1

    if failures:
        return 1
    print(f"Rust compiler contract is pinned to {EXPECTED_TOOLCHAIN}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
