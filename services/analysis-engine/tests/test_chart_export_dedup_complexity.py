"""Deterministic complexity regression for chart-export role de-duplication."""

from typing import ClassVar

from bandscope_analysis.exports.chart import _active_role_ids


class _CountingRoleId(str):
    """String role id that counts equality work without wall-clock timing."""

    comparisons: ClassVar[int] = 0

    def __eq__(self, other: object) -> bool:
        """Count one equality comparison and preserve normal string semantics."""
        type(self).comparisons += 1
        return super().__eq__(other)

    def __hash__(self) -> int:
        """Preserve normal string hashing for representative hash membership."""
        return super().__hash__()


def test_active_role_id_deduplication_avoids_quadratic_equality_work() -> None:
    """Unique active ids must not require pairwise list-membership comparisons."""
    role_ids = [_CountingRoleId(f"role-{index}") for index in range(64)]
    section = {
        "partGraph": [
            {"role_id": role_id, "is_active": True}
            for role_id in [*role_ids, _CountingRoleId("role-0")]
        ]
    }

    _CountingRoleId.comparisons = 0
    active = _active_role_ids(section)

    assert active == role_ids
    assert _CountingRoleId.comparisons < 256
