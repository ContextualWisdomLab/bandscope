#!/usr/bin/env python3
"""Repair the seven stale Rust-audit policy-test scopes for PR #944.

This temporary owner-side driver is intentionally fail closed. It changes only
``cargo +stable audit`` tokens inside the seven named regression functions that
were proven stale by the exact-head quickcheck, preserves intentional floating
selector rejection fixtures elsewhere, and records the repair in the product
technical gap baseline. Remove this driver after exact-head verification proves
the permanent test-contract repair.
"""

from __future__ import annotations

import ast
import os
from pathlib import Path


TEST_PATH = Path("services/analysis-engine/tests/test_supply_chain_policy.py")
BASELINE_PATH = Path("docs/product-technical-gap-baseline.md")
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
RECORD_HEADING = "### Rust audit stale policy-test repair — 2026-09-02"


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


def update_baseline() -> None:
    """Record exact input-head provenance and the narrow contract correction."""
    if not BASELINE_PATH.exists():
        raise SystemExit(f"missing {BASELINE_PATH}")
    text = BASELINE_PATH.read_text(encoding="utf-8")
    if RECORD_HEADING in text:
        return
    input_head = os.environ.get("GITHUB_SHA", "unknown-exact-input-head")
    record = f"""

{RECORD_HEADING}

- **Owner / PR:** `ContextualWisdomLab/bandscope#944`.
- **Exact repair input:** `{input_head}` on `agent/rust-toolchain-refresh-2026-08-19`; successor evidence must bind the resulting exact head.
- **Root cause:** seven policy-test scopes retained 11 obsolete `cargo +stable audit` fixture/assertion tokens after the executable Rust audit contract moved to repository-pinned `cargo +1.97.1 audit`, making correct production policy impossible to admit.
- **Repair:** update only those 11 tokens inside the seven proven stale scopes; preserve floating-selector rejection fixtures outside them and leave `scripts/checks/verify_supply_chain.py` unchanged.
- **Verification:** focused `test_supply_chain_policy.py` plus repository-pinned Ruff checks execute in the repair lane; ordinary branch CI owns canonical `./scripts/harness/quickcheck.sh` on the resulting exact head.
- **Status:** Proposed until the resulting exact head receives fresh CI/security/review evidence and inherited dependency-security authority remains with canonical #783.
"""
    BASELINE_PATH.write_text(text.rstrip() + record + "\n", encoding="utf-8")


def main() -> None:
    """Apply the bounded stale-test repair and traceability record."""
    source = TEST_PATH.read_text(encoding="utf-8")
    repaired = repair_tests(source)
    TEST_PATH.write_text(repaired, encoding="utf-8")
    update_baseline()


if __name__ == "__main__":
    main()
