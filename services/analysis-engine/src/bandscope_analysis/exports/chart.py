"""Chart-style cue-sheet text export for rehearsal song payloads.

Turns the ``RehearsalSong`` dict built by :mod:`bandscope_analysis.api` into
compact rehearsal artifacts: a plain-text chart summary and structured
cue-sheet rows suitable for CSV/JSON export.

Security Notes:
    - Pure dict-to-string transformation: no file, network, or process I/O.
    - Never reads source-path fields and never emits filesystem paths.
    - Safe failure: ``None``, empty, or malformed input yields ``\"\"`` / ``[]``;
      missing or malformed keys are skipped and no exceptions escape.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import TypedDict

__all__ = ["CueSheetRow", "build_chart_text", "build_cue_sheet_rows"]


class CueSheetRow(TypedDict):
    """Structured cue-sheet row suitable for CSV/JSON export."""

    section: str
    start: str
    end: str
    cue: str
    roles: list[str]


def _format_mmss(total_seconds: int) -> str:
    """Format non-negative whole seconds as ``mm:ss``."""
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"


def _parse_time_range(section: Mapping[str, object]) -> tuple[str, str] | None:
    """Return the section's ``(start, end)`` as ``mm:ss`` strings, or ``None``."""
    time_range = section.get("timeRange")
    if not isinstance(time_range, Mapping):
        return None
    start = time_range.get("start")
    end = time_range.get("end")
    if not isinstance(start, int) or isinstance(start, bool) or start < 0:
        return None
    if not isinstance(end, int) or isinstance(end, bool) or end < start:
        return None
    return _format_mmss(start), _format_mmss(end)


def _song_sections(song: Mapping[str, object]) -> list[Mapping[str, object]]:
    """Return the song's section payloads, skipping malformed entries."""
    sections = song.get("sections")
    if not isinstance(sections, list):
        return []
    return [section for section in sections if isinstance(section, Mapping)]


def _section_label(section: Mapping[str, object]) -> str | None:
    """Return the section's display label, or ``None`` when missing."""
    label = section.get("label")
    if isinstance(label, str) and label:
        return label
    return None


def _section_roles(section: Mapping[str, object]) -> list[Mapping[str, object]]:
    """Return the section's role payloads, skipping malformed entries."""
    roles = section.get("roles")
    if not isinstance(roles, list):
        return []
    return [role for role in roles if isinstance(role, Mapping)]


def _hashable_text(raw_text_value: object) -> str | None:
    """Return compatible string-like text as a safe built-in mapping key."""
    if not isinstance(raw_text_value, str):
        return None
    try:
        hash(raw_text_value)
        normalized_text = str.__str__(raw_text_value)
    except Exception:
        return None
    return normalized_text if normalized_text else None


def _active_role_ids(section_payload: Mapping[str, object]) -> list[str] | None:
    """Return active role ids from the part graph, or ``None`` when absent."""
    part_graph = section_payload.get("partGraph")
    if not isinstance(part_graph, list):
        return None
    active_role_ids_by_id: dict[str, None] = {}
    for part_graph_node in part_graph:
        if not isinstance(part_graph_node, Mapping) or part_graph_node.get("is_active") is not True:
            continue
        role_id = _hashable_text(part_graph_node.get("role_id"))
        if role_id is not None:
            active_role_ids_by_id[role_id] = None
    return list(active_role_ids_by_id)


def _active_roles(section_payload: Mapping[str, object]) -> list[Mapping[str, object]]:
    """Return the section's active role payloads.

    Activity is derived from the part graph's ``is_active`` flags; when the
    part graph is absent the roles list itself is treated as active. Active
    graph nodes without a matching role payload keep their ``role_id`` as a
    display name.
    """
    section_role_payloads = _section_roles(section_payload)
    active_role_ids = _active_role_ids(section_payload)
    if active_role_ids is None:
        return section_role_payloads
    role_payload_by_id: dict[str, Mapping[str, object]] = {}
    for role_payload in section_role_payloads:
        role_id = _hashable_text(role_payload.get("id"))
        if role_id is not None and role_id not in role_payload_by_id:
            role_payload_by_id[role_id] = role_payload
    return [
        role_payload_by_id.get(role_id, {"id": role_id, "name": role_id})
        for role_id in active_role_ids
    ]


def _role_display_name(role_payload: Mapping[str, object]) -> str | None:
    """Return a hashable display name, falling back to a hashable role id."""
    display_name = _hashable_text(role_payload.get("name"))
    if display_name is not None:
        return display_name
    return _hashable_text(role_payload.get("id"))


def _active_role_names(section_payload: Mapping[str, object]) -> list[str]:
    """Return de-duplicated display names for the section's active roles."""
    active_role_names_by_name: dict[str, None] = {}
    for role_payload in _active_roles(section_payload):
        display_name = _role_display_name(role_payload)
        if display_name is not None:
            active_role_names_by_name[display_name] = None
    return list(active_role_names_by_name)


def _section_cue(section_payload: Mapping[str, object]) -> str:
    """Join the active roles' cue values into a single cue string."""
    active_cue_values: dict[str, None] = {}
    for role_payload in _active_roles(section_payload):
        cue_payload = role_payload.get("cue")
        if not isinstance(cue_payload, Mapping):
            continue
        cue_value = _hashable_text(cue_payload.get("value"))
        if cue_value is not None:
            active_cue_values[cue_value] = None
    return "; ".join(active_cue_values)


def _confidence_level(section: Mapping[str, object]) -> str | None:
    """Return the section's confidence level, or ``None`` when missing."""
    confidence = section.get("confidence")
    if not isinstance(confidence, Mapping):
        return None
    level = confidence.get("level")
    if isinstance(level, str) and level:
        return level
    return None


def _header_lines(song: Mapping[str, object]) -> list[str]:
    """Build the chart header: title plus optional BPM/key/feel lines."""
    lines: list[str] = []
    title = song.get("title")
    if isinstance(title, str) and title:
        lines.append(title)
    for field, label in (("bpm", "BPM"), ("key", "Key"), ("feel", "Feel")):
        value = song.get(field)
        if isinstance(value, (str, int, float)) and not isinstance(value, bool):
            lines.append(f"{label}: {value}")
    return lines


def _section_lines(sections: list[Mapping[str, object]]) -> list[str]:
    """Build one chart line per section with a valid label and time range."""
    lines: list[str] = []
    for section in sections:
        label = _section_label(section)
        times = _parse_time_range(section)
        if label is None or times is None:
            continue
        line = f"[{times[0]}-{times[1]}] {label.upper()}"
        level = _confidence_level(section)
        if level is not None:
            line += f"  ({level})"
        names = _active_role_names(section)
        if names:
            line += f"  roles: {', '.join(names)}"
        lines.append(line)
    return lines


def _footer_lines(
    song_payload: Mapping[str, object],
    section_payloads: list[Mapping[str, object]],
) -> list[str]:
    """Build the footer: per-role rehearsal priorities and the export focus."""
    footer_lines: list[str] = []
    rehearsal_priority_lines: dict[str, None] = {}
    for section_payload in section_payloads:
        for role_payload in _section_roles(section_payload):
            display_name = _role_display_name(role_payload)
            rehearsal_priority = _hashable_text(role_payload.get("rehearsalPriority"))
            if display_name is None or rehearsal_priority is None:
                continue
            priority_line = f"  - {display_name}: {rehearsal_priority}"
            rehearsal_priority_lines[priority_line] = None
    if rehearsal_priority_lines:
        footer_lines.append("Priorities:")
        footer_lines.extend(rehearsal_priority_lines)
    export_summary = song_payload.get("exportSummary")
    if isinstance(export_summary, Mapping):
        focus_headline = export_summary.get("headline")
        if isinstance(focus_headline, str) and focus_headline:
            footer_lines.append(f"Focus: {focus_headline}")
    return footer_lines


def build_chart_text(song: Mapping[str, object] | None) -> str:
    """Build a compact plain-text rehearsal chart from a song payload.

    The chart has a header (title and optional BPM/key/feel), one line per
    section (``[mm:ss-mm:ss] LABEL  (confidence)  roles: ...``), and a footer
    with rehearsal priorities and the export focus headline. Output is
    deterministic and never contains filesystem paths. Malformed input
    yields ``\"\"``.
    """
    if not isinstance(song, Mapping):
        return ""
    sections = _song_sections(song)
    blocks = [
        block
        for block in (_header_lines(song), _section_lines(sections), _footer_lines(song, sections))
        if block
    ]
    if not blocks:
        return ""
    return "\n\n".join("\n".join(block) for block in blocks)


def build_cue_sheet_rows(song: Mapping[str, object] | None) -> list[CueSheetRow]:
    """Build structured cue-sheet rows from a song payload.

    Each row carries the section label, ``mm:ss`` start/end times, a joined
    cue string from the active roles, and the active role names. Sections
    without a valid label or time range are skipped; malformed input yields
    ``[]``.
    """
    if not isinstance(song, Mapping):
        return []
    rows: list[CueSheetRow] = []
    for section in _song_sections(song):
        label = _section_label(section)
        times = _parse_time_range(section)
        if label is None or times is None:
            continue
        rows.append(
            {
                "section": label,
                "start": times[0],
                "end": times[1],
                "cue": _section_cue(section),
                "roles": _active_role_names(section),
            }
        )
    return rows
