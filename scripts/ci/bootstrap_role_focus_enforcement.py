#!/usr/bin/env python3
"""Enforce role focus in analysis results while retaining full reusable caches."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "services/analysis-engine/src/bandscope_analysis/api.py"
SELF = ROOT / "scripts/ci/bootstrap_role_focus_enforcement.py"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace one exact reviewed fragment and reject branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    """Patch role-focused result projection and remove this one-shot helper."""
    text = API.read_text(encoding="utf-8")
    helper_anchor = '''    return status


def _analysis_cache_path(request: AnalysisJobRequest) -> Path | None:
'''
    helper = '''    return status


def _focus_rehearsal_song(
    result: RehearsalSong,
    role_focus: list[str],
) -> RehearsalSong:
    """Project one complete analysis onto requested roles without mutating its cache value."""
    if not role_focus:
        return result

    focus_ids = set(role_focus)
    focused_sections: list[RehearsalSectionPayload] = []
    focus_sections: list[str] = []
    for section in result["sections"]:
        focused_roles = [role for role in section["roles"] if role["id"] in focus_ids]
        focused_graph: list[PartGraphNodePayload] = []
        for node in section["partGraph"]:
            if node["role_id"] not in focus_ids:
                continue
            focused_graph.append(
                {
                    **node,
                    "handoff_to": [
                        role_id for role_id in node["handoff_to"] if role_id in focus_ids
                    ],
                    "handoff_from": [
                        role_id for role_id in node["handoff_from"] if role_id in focus_ids
                    ],
                }
            )
        focused_sections.append(
            {
                **section,
                "roles": focused_roles,
                "partGraph": focused_graph,
            }
        )
        if focused_roles and section["label"] not in focus_sections:
            focus_sections.append(section["label"])

    return {
        **result,
        "sections": focused_sections,
        "exportSummary": {
            **result["exportSummary"],
            "focusSections": focus_sections,
        },
    }


def _analysis_cache_path(request: AnalysisJobRequest) -> Path | None:
'''
    text = replace_once(text, helper_anchor, helper, "role focus helper")

    cache_old = '''        cached_result = _load_cached_analysis(cache_path)
        if cached_result is not None:
            return [
'''
    cache_new = '''        cached_result = _load_cached_analysis(cache_path)
        if cached_result is not None:
            focused_cached_result = _focus_rehearsal_song(
                cached_result,
                request["roleFocus"],
            )
            return [
'''
    text = replace_once(text, cache_old, cache_new, "cache focus projection")
    text = replace_once(
        text,
        '''                    result=cached_result,
''',
        '''                    result=focused_cached_result,
''',
        "focused cache result",
    )

    build_old = '''    result = build_demo_rehearsal_song(audio_features)
    updates.append(
'''
    build_new = '''    complete_result = build_demo_rehearsal_song(audio_features)
    focused_result = _focus_rehearsal_song(complete_result, request["roleFocus"])
    updates.append(
'''
    text = replace_once(text, build_old, build_new, "new analysis focus projection")
    text = replace_once(
        text,
        '''            "stored" if _store_cached_analysis(cache_path, request, result) else "miss"
''',
        '''            "stored"
            if _store_cached_analysis(cache_path, request, complete_result)
            else "miss"
''',
        "full analysis cache storage",
    )
    text = replace_once(
        text,
        '''            result=result,
''',
        '''            result=focused_result,
''',
        "focused final result",
    )

    API.write_text(text, encoding="utf-8")
    SELF.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
