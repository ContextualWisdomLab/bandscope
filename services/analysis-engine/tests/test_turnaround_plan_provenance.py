"""Regression coverage for turnaround-plan provenance."""

from bandscope_analysis.roles.extractor import RoleExtractor


def test_activity_turnaround_plan_marks_generated_copy_as_model_owned() -> None:
    """Generated turnaround copy carries explicit provenance into the role contract."""
    extractor = RoleExtractor()
    empty_range = {"lowestNote": "", "highestNote": ""}
    roles = extractor._build_roles("", empty_range, "", empty_range)
    activity = {
        "bass-guitar": True,
        "keys-left": False,
        "keys-right": False,
        "lead-vocal": True,
        "acoustic-guitar": False,
    }

    topology = extractor._build_activity_topology("verse-1", roles, activity, activity)
    generated_roles = [role for role in topology["active_roles"] if "turnaroundPlan" in role]

    assert generated_roles
    assert all(role["turnaroundPlanSource"] == "model" for role in generated_roles)


def test_heuristic_topology_does_not_invent_turnaround_provenance() -> None:
    """Fallback topology must not claim provenance when it has no turnaround plan."""
    extractor = RoleExtractor()
    empty_range = {"lowestNote": "", "highestNote": ""}
    roles = extractor._build_roles("", empty_range, "", empty_range)

    topology = extractor._build_topology("verse-1", True, roles)

    assert all("turnaroundPlan" not in role for role in topology["active_roles"])
    assert all("turnaroundPlanSource" not in role for role in topology["active_roles"])
