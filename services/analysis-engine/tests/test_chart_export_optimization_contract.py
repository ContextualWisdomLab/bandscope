"""Regression contracts for the ordered chart-export optimization."""

from __future__ import annotations

from pathlib import Path

from bandscope_analysis.exports.chart import build_chart_text

PERFORMANCE_NOTE = (
    "- 차트 내보내기(chart.py)에서 `not in list` 대신 삽입 순서가 보장되는 "
    "딕셔너리(`dict.keys()`)를 활용하여 역할, 큐 및 우선순위 데이터의 중복 제거 "
    "방식을 $O(N^2)$에서 $O(N)$으로 최적화했습니다."
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


def test_chart_optimization_note_is_owned_by_unreleased() -> None:
    """Keep current performance work out of immutable historical release notes."""
    changelog = (_repo_root() / "CHANGELOG.md").read_text(encoding="utf-8")
    unreleased, separator, _released = changelog.partition("\n## [0.1.3]")

    assert separator, "expected the first released-version heading"
    assert PERFORMANCE_NOTE in unreleased
    assert changelog.count(PERFORMANCE_NOTE) == 1


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
