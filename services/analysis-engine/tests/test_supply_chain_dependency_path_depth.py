"""Depth-safety regressions for Cargo dependency owner-chain traversal."""

from __future__ import annotations

import sys

from conftest import load_module


def test_dependency_path_handles_graph_deeper_than_python_recursion_limit() -> None:
    """A valid long Cargo graph must not fail because Python recursion is bounded."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_dependency_path_depth",
    )
    edge_count = sys.getrecursionlimit() + 50
    package_dependencies = {
        f"node-{index} 1.0.0": [f"node-{index + 1} 1.0.0"] for index in range(edge_count)
    }
    package_dependencies[f"node-{edge_count} 1.0.0"] = []

    assert (
        supply_chain.cargo_lock_has_named_dependency_path(
            package_dependencies,
            "node-0 1.0.0",
            ("missing-owner",),
        )
        is False
    )
