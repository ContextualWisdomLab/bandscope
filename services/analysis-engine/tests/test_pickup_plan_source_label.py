"""Regression coverage for cross-layer pickup-plan source labels."""

from bandscope_analysis.roles.extractor import RoleExtractor


def test_activity_pickup_plan_names_shared_accompaniment_source_consistently() -> None:
    """Generated pickup copy must use the same shared-source label as the workspace UI."""
    pickup_plan = RoleExtractor._activity_pickup_plan(
        "bass-guitar",
        {},
        {"bass-guitar": True, "keys-right": True},
        {"bass-guitar": False, "keys-right": True},
    )

    assert pickup_plan == "Play this pickup with Keys / guitar; land the downbeat together."
