#!/usr/bin/env python3
"""Apply the bounded PR #944 stale Rust-audit test-contract repair.

This transition helper exists only to update the seven already-proven stale
policy-test scopes on the existing PR branch. It must not edit canonical product
baseline documentation or production policy. Remove it after the repaired test
file is published and revalidated on the resulting exact head.
"""

from __future__ import annotations

import ast
from pathlib import Path


TEST_PATH = Path("services/analysis-engine/tests/test_supply_chain_policy.py")
OLD = "cargo +stable audit"
NEW = "cargo +1.97.1 audit"
EXPECTED_BY_SCOPE = {
    "test_security_audit_workflow_keeps_dependency_vulnerability_scans": 1,
    "test_supply_chain_check_requires_audit_tokens_in_run_steps": 2,
    "test_supply_chain_check_accepts_nested_shell_audit_commands": 1,
    "test_supply_chain_check_rejects_noop_audit_command_spoofs": 2,
    "test_supply_chain_check_requires_blocking_audit_steps": 2,
    "test_supply_chain_check_requires_unconditional_audit_steps": 2,
    "test_supply_chain_check_accepts_explicit_false_continue_on_error_audit_steps": 1,
}
EXPECTED_TOTAL = sum(EXPECTED_BY_SCOPE.values())


def function_ranges(source: str) -> dict[str, tuple[int, int]]:
    """Return one-based inclusive line ranges for the named top-level tests."""
    tree = ast.parse(source)
    ranges: dict[str, tuple[int, int]] = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in EXPECTED_BY_SCOPE:
            if node.end_lineno is None:
                raise SystemExit(f"missing end_lineno for {node.name}")
            ranges[node.name] = (node.lineno, node.end_lineno)
    missing = sorted(set(EXPECTED_BY_SCOPE) - set(ranges))
    if missing:
        raise SystemExit(f"missing expected stale-test scopes: {missing}")
    return ranges


def repair_tests(source: str) -> str:
    """Replace only the proven stale audit command occurrences."""
    lines = source.splitlines(keepends=True)
    ranges = function_ranges(source)
    replaced_total = 0
    for name, expected in EXPECTED_BY_SCOPE.items():
        start, end = ranges[name]
        segment_lines = lines[start - 1 : end]
        segment = "".join(segment_lines)
        actual = segment.count(OLD)
        if actual != expected:
            raise SystemExit(
                f"{name} drifted: expected {expected} stale audit token(s), found {actual}"
            )
        replaced_total += actual
        repaired_segment_lines = segment.replace(OLD, NEW).splitlines(keepends=True)
        if len(repaired_segment_lines) != len(segment_lines):
            raise SystemExit(f"{name} line cardinality changed during literal repair")
        lines[start - 1 : end] = repaired_segment_lines
    if replaced_total != EXPECTED_TOTAL:
        raise SystemExit(
            f"replacement cardinality drifted: expected {EXPECTED_TOTAL}, got {replaced_total}"
        )
    repaired = "".join(lines)
    if source.count(OLD) - repaired.count(OLD) != EXPECTED_TOTAL:
        raise SystemExit("replacement escaped the seven allowed scopes")
    if repaired.count(NEW) - source.count(NEW) != EXPECTED_TOTAL:
        raise SystemExit("pinned-audit replacement cardinality is incorrect")
    return repaired


def main() -> None:
    """Apply the bounded stale-test repair without touching canonical baseline docs."""
    source = TEST_PATH.read_text(encoding="utf-8")
    repaired = repair_tests(source)
    TEST_PATH.write_text(repaired, encoding="utf-8")


if __name__ == "__main__":
    main()
