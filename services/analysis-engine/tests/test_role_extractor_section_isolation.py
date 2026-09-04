"""Regression tests for section-local role ownership in RoleExtractor."""

from bandscope_analysis.roles.extractor import RoleExtractor


def _empty_range() -> dict[str, str]:
    """Return the minimal empty range accepted by the role builder."""
    return {"lowestNote": "", "highestNote": ""}


def test_activity_topologies_do_not_share_mutable_role_objects() -> None:
    """Mutating one section's active role cannot alter another section or the role template."""
    extractor = RoleExtractor()
    roles = extractor._build_roles("", _empty_range(), "", _empty_range())
    activity = {"lead-vocal": True}

    first = extractor._build_activity_topology("verse-1", roles, activity, None)
    second = extractor._build_activity_topology("verse-2", roles, activity, None)

    first_vocal = first["active_roles"][0]
    second_vocal = second["active_roles"][0]
    first_vocal["setupNote"] = "section-local edit"

    assert second_vocal["setupNote"] != "section-local edit"
    assert roles["vocal"]["setupNote"] != "section-local edit"
    assert first_vocal is not second_vocal
    assert first_vocal is not roles["vocal"]
    assert second_vocal is not roles["vocal"]
