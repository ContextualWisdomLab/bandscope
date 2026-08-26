"""Regression coverage for pickup-plan provenance."""

from bandscope_analysis.roles.extractor import RoleExtractor


def test_activity_pickup_plan_marks_generated_copy_as_model_owned() -> None:
    """Generated pickup copy carries explicit provenance into the role contract."""
    extractor = RoleExtractor()
    empty_range = {"lowestNote": "", "highestNote": ""}
    roles = extractor._build_roles("", empty_range, "", empty_range)
    previous = {
        "bass-guitar": True,
        "keys-left": False,
        "keys-right": False,
        "lead-vocal": False,
        "acoustic-guitar": False,
    }
    current = {
        "bass-guitar": True,
        "keys-left": False,
        "keys-right": False,
        "lead-vocal": True,
        "acoustic-guitar": False,
    }

    topology = extractor._build_activity_topology("verse-1", roles, current, None, previous)
    generated_roles = [role for role in topology["active_roles"] if "pickupPlan" in role]

    assert generated_roles
    assert all(role["pickupPlanSource"] == "model" for role in generated_roles)


def test_heuristic_topology_does_not_invent_pickup_provenance() -> None:
    """Fallback topology must not claim provenance when it has no pickup plan."""
    extractor = RoleExtractor()
    empty_range = {"lowestNote": "", "highestNote": ""}
    roles = extractor._build_roles("", empty_range, "", empty_range)

    topology = extractor._build_topology("verse-1", True, roles)

    assert all("pickupPlan" not in role for role in topology["active_roles"])
    assert all("pickupPlanSource" not in role for role in topology["active_roles"])
