"""Regression contracts for the ordered chart-export optimization."""

from __future__ import annotations

from pathlib import Path

from bandscope_analysis.exports.chart import build_chart_text, build_cue_sheet_rows

PERFORMANCE_NOTE = (
    "- 차트 내보내기(chart.py)에서 `not in list` 대신 삽입 순서가 보장되는 "
    "딕셔너리(`dict.keys()`)를 활용하여 역할, 큐 및 우선순위 데이터의 중복 제거 "
    "방식을 $O(N^2)$에서 $O(N)$으로 최적화했습니다."
)
RELEASED_AUDIO_INTAKE_NOTE = (
    "- Issue #33: Implemented secure local audio intake and project bootstrap"
)


def _repo_root() -> Path:
    """Return the repository root from this analysis-engine test module."""
    for parent in Path(__file__).resolve().parents:
        if (parent / "CHANGELOG.md").is_file() and (parent / "package.json").is_file():
            return parent
    raise RuntimeError("Could not locate the repository root")


def _role(role_id: str, name: str, priority: str) -> dict[str, object]:
    """Build the minimal role payload used by the priority-order regression."""
    return {"id": role_id, "name": name, "rehearsalPriority": priority}


def _cue_role(role_id: str, name: str, cue_value: str) -> dict[str, object]:
    """Build an active role with a display name and cue for ordered dedup tests."""
    return {
        "id": role_id,
        "name": name,
        "cue": {"kind": "entrance", "value": cue_value},
    }


def test_chart_optimization_note_is_owned_by_unreleased() -> None:
    """Keep current performance work out of immutable historical release notes."""
    changelog = (_repo_root() / "CHANGELOG.md").read_text(encoding="utf-8")
    unreleased, separator, released = changelog.partition("\n## [0.1.3]")

    assert separator, "expected the first released-version heading"
    assert PERFORMANCE_NOTE in unreleased
    assert changelog.count(PERFORMANCE_NOTE) == 1
    assert RELEASED_AUDIO_INTAKE_NOTE in released
    assert "- Issue #33: Engineered secure local audio intake and project bootstrap" not in released


def test_priority_deduplication_preserves_first_occurrence_order_exactly() -> None:
    """De-duplicate exact priority lines while retaining their source order."""
    song: dict[str, object] = {
        "title": "Ordered priorities",
        "sections": [
            {
                "label": "verse",
                "timeRange": {"start": 0, "end": 10},
                "roles": [
                    _role("bass", "Bass", "high"),
                    _role("drums", "Drums", "medium"),
                    _role("bass-copy", "Bass", "high"),
                ],
            },
            {
                "label": "chorus",
                "timeRange": {"start": 10, "end": 20},
                "roles": [
                    _role("keys", "Keys", "low"),
                    _role("drums-copy", "Drums", "medium"),
                ],
            },
        ],
    }

    output = build_chart_text(song)
    priority_lines = [line for line in output.splitlines() if line.startswith("  - ")]

    assert priority_lines == [
        "  - Bass: high",
        "  - Drums: medium",
        "  - Keys: low",
    ]


def test_active_role_and_cue_deduplication_uses_distinct_active_role_ids() -> None:
    """Exercise duplicate display/cue values through distinct active graph role IDs."""
    song: dict[str, object] = {
        "title": "Ordered active values",
        "sections": [
            {
                "label": "verse",
                "timeRange": {"start": 0, "end": 10},
                "roles": [
                    _cue_role("bass", "Bass", "Walk up"),
                    _cue_role("drums", "Drums", "Hit on 1"),
                    _cue_role("bass-copy", "Bass", "Walk up"),
                    _cue_role("drums-copy", "Drums", "Hit on 1"),
                ],
                "partGraph": [
                    {"role_id": "bass", "is_active": True},
                    {"role_id": "drums", "is_active": True},
                    {"role_id": "bass-copy", "is_active": True},
                    {"role_id": "drums-copy", "is_active": True},
                ],
            }
        ],
    }

    rows = build_cue_sheet_rows(song)

    assert rows[0]["roles"] == ["Bass", "Drums"]
    assert rows[0]["cue"] == "Walk up; Hit on 1"
    assert "roles: Bass, Drums" in build_chart_text(song)
