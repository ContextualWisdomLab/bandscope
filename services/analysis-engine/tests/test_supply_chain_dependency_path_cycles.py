"""Regression tests for Cargo dependency-path cycle handling."""

from conftest import load_module


def test_dependency_path_does_not_reuse_a_package_key_through_a_cycle() -> None:
    """Ensure a cycle cannot make one package instance satisfy two path positions."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_dependency_path_cycle_regression",
    )
    package_dependencies = {
        "root 1.0.0": ["alpha 1.0.0"],
        "alpha 1.0.0": ["beta 1.0.0", "charlie 1.0.0"],
        "beta 1.0.0": ["alpha 1.0.0"],
        "charlie 1.0.0": [],
    }

    assert not supply_chain.cargo_lock_has_named_dependency_path(
        package_dependencies,
        "root 1.0.0",
        ("alpha", "alpha", "charlie"),
    )


def test_dependency_path_can_match_same_name_on_distinct_package_keys() -> None:
    """Ensure distinct package instances may legitimately satisfy repeated names."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_dependency_path_distinct_instances",
    )
    package_dependencies = {
        "root 1.0.0": ["alpha 1.0.0"],
        "alpha 1.0.0": ["beta 1.0.0"],
        "beta 1.0.0": ["alpha 2.0.0"],
        "alpha 2.0.0": ["charlie 1.0.0"],
        "charlie 1.0.0": [],
    }

    assert supply_chain.cargo_lock_has_named_dependency_path(
        package_dependencies,
        "root 1.0.0",
        ("alpha", "alpha", "charlie"),
    )
