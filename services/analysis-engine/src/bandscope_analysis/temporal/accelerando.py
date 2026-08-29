"""Stamp tonight's first accelerando plan from existing tempo-stability changes.

An accelerando is the earliest sustained speeding (``to_bpm > from_bpm``) that is
not a double-time feel (~1.9–2.1) or a half-time feel (~0.5). The owned
``accelerandoPlan`` copy lands on the highest-priority active named vocal or
bass in the section that contains that change. Heuristic/demo topology stays
unnamed. This is not a new MIR product: it only reads
``analyze_tempo_stability`` output.

Security Notes:
    Pure in-memory mutation of an already-built rehearsal song. Beat times and
    song topology are untrusted runtime values: malformed numbers, missing
    identity, repeated graph ids, or inactive parts fail closed instead of
    inventing a plan. No file, network, or subprocess I/O.
"""

from __future__ import annotations

from collections.abc import Mapping, MutableMapping, Sequence
from math import isfinite
from typing import Any

from bandscope_analysis.temporal.stability import TempoChange, analyze_tempo_stability

DOUBLE_TIME_RATIO_MIN = 1.9
DOUBLE_TIME_RATIO_MAX = 2.1
NAMED_ACCELERANDO_ROLE_IDS = frozenset({"bass-guitar", "lead-vocal"})
PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
ACCELERANDO_PLAN_PREFIX = "Push this part from "
ACCELERANDO_PLAN_MIDDLE = " BPM into "
ACCELERANDO_PLAN_SUFFIX = " BPM; let the next downbeat arrive sooner."


def format_accelerando_bpm(value: float) -> str | None:
    """Return a buyer-facing BPM token, or None when the value is unusable."""
    if not isfinite(value) or value <= 0:
        return None
    rounded = round(float(value), 1)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.1f}"


def accelerando_plan_copy(from_bpm: float, to_bpm: float) -> str | None:
    """Return the owned model accelerando copy, or None when BPM tokens are unusable."""
    from_token = format_accelerando_bpm(from_bpm)
    to_token = format_accelerando_bpm(to_bpm)
    if from_token is None or to_token is None:
        return None
    return (
        f"{ACCELERANDO_PLAN_PREFIX}{from_token}"
        f"{ACCELERANDO_PLAN_MIDDLE}{to_token}{ACCELERANDO_PLAN_SUFFIX}"
    )


def is_accelerando_change(change: Mapping[str, Any]) -> bool:
    """Return whether a tempo change is a speeding that is not a feel flip."""
    from_bpm = change.get("from_bpm")
    to_bpm = change.get("to_bpm")
    if not isinstance(from_bpm, (int, float)) or isinstance(from_bpm, bool):
        return False
    if not isinstance(to_bpm, (int, float)) or isinstance(to_bpm, bool):
        return False
    if not isfinite(from_bpm) or not isfinite(to_bpm) or from_bpm <= 0 or to_bpm <= 0:
        return False
    if to_bpm <= from_bpm:
        return False
    ratio = float(to_bpm) / float(from_bpm)
    if DOUBLE_TIME_RATIO_MIN <= ratio <= DOUBLE_TIME_RATIO_MAX:
        return False
    return True


def first_accelerando(tempo_changes: Sequence[Mapping[str, Any]] | None) -> TempoChange | None:
    """Return the earliest accelerando change, or None when none is corroborated."""
    if not isinstance(tempo_changes, Sequence) or isinstance(tempo_changes, (str, bytes)):
        return None
    for change in tempo_changes:
        if not isinstance(change, Mapping):
            continue
        if not is_accelerando_change(change):
            continue
        time = change.get("time")
        from_bpm = change.get("from_bpm")
        to_bpm = change.get("to_bpm")
        if (
            not isinstance(time, (int, float))
            or isinstance(time, bool)
            or not isfinite(time)
            or time < 0
            or not isinstance(from_bpm, (int, float))
            or isinstance(from_bpm, bool)
            or not isinstance(to_bpm, (int, float))
            or isinstance(to_bpm, bool)
        ):
            continue
        return TempoChange(
            time=float(time),
            from_bpm=float(from_bpm),
            to_bpm=float(to_bpm),
        )
    return None


def _role_type_value(role_type: Any) -> str:
    """Normalize enum or string role types to a comparable token."""
    value = getattr(role_type, "value", role_type)
    return value if isinstance(value, str) else ""


def _priority_value(priority: Any) -> str:
    """Normalize enum or string rehearsal priority to a comparable token."""
    value = getattr(priority, "value", priority)
    return value if isinstance(value, str) else ""


def _is_named_vocal_or_bass(role: Mapping[str, Any]) -> bool:
    """Return whether a role is a named vocal or bass that may own an accel."""
    role_id = role.get("id")
    if not isinstance(role_id, str) or role_id.strip() == "":
        return False
    if role_id in NAMED_ACCELERANDO_ROLE_IDS:
        return True
    return _role_type_value(role.get("roleType")) == "vocal"


def _repeated_ids(ids: list[str]) -> set[str]:
    """Return ids that appear more than once in one section-local collection."""
    seen: set[str] = set()
    repeated: set[str] = set()
    for role_id in ids:
        if role_id in seen:
            repeated.add(role_id)
        else:
            seen.add(role_id)
    return repeated


def _active_role_ids(section: Mapping[str, Any]) -> set[str]:
    """Return unique graph role ids whose node is explicitly active."""
    part_graph = section.get("partGraph")
    if not isinstance(part_graph, list):
        return set()
    safe_ids = [
        node.get("role_id")
        for node in part_graph
        if isinstance(node, Mapping)
        and isinstance(node.get("role_id"), str)
        and node["role_id"].strip()
    ]
    repeated = _repeated_ids([role_id for role_id in safe_ids if isinstance(role_id, str)])
    active: set[str] = set()
    for node in part_graph:
        if not isinstance(node, Mapping) or node.get("is_active") is not True:
            continue
        role_id = node.get("role_id")
        if isinstance(role_id, str) and role_id.strip() and role_id not in repeated:
            active.add(role_id)
    return active


def _section_contains(
    section: Mapping[str, Any],
    time: float,
    precise_boundary: Sequence[float] | None = None,
) -> bool:
    """Return whether a section window contains a tempo-change time."""
    if precise_boundary is not None:
        if (
            not isinstance(precise_boundary, Sequence)
            or isinstance(precise_boundary, (str, bytes))
            or len(precise_boundary) != 2
            or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not isfinite(value)
                for value in precise_boundary
            )
        ):
            return False
        precise_start, precise_end = (float(value) for value in precise_boundary)
        return (
            precise_start >= 0
            and precise_end > precise_start
            and precise_start <= time < precise_end
        )
    time_range = section.get("timeRange")
    if not isinstance(time_range, Mapping):
        return False
    start = time_range.get("start")
    end = time_range.get("end")
    if not isinstance(start, int) or isinstance(start, bool) or start < 0:
        return False
    if not isinstance(end, int) or isinstance(end, bool) or end <= start:
        return False
    return start <= time < end


def _pick_landing_role(section: Mapping[str, Any]) -> MutableMapping[str, Any] | None:
    """Pick the highest-priority unique active named vocal or bass."""
    roles = section.get("roles")
    if not isinstance(roles, list):
        return None
    active_ids = _active_role_ids(section)
    safe_ids = [
        role.get("id")
        for role in roles
        if isinstance(role, Mapping) and isinstance(role.get("id"), str) and role["id"].strip()
    ]
    repeated = _repeated_ids([role_id for role_id in safe_ids if isinstance(role_id, str)])
    ranked: list[tuple[int, int, str, MutableMapping[str, Any]]] = []
    for role in roles:
        if not isinstance(role, MutableMapping):
            continue
        role_id = role.get("id")
        name = role.get("name")
        priority = _priority_value(role.get("rehearsalPriority"))
        if not isinstance(role_id, str) or role_id.strip() == "" or role_id in repeated:
            continue
        if not isinstance(name, str) or name.strip() == "":
            continue
        if role_id not in active_ids or not _is_named_vocal_or_bass(role):
            continue
        if priority not in PRIORITY_RANK:
            continue
        is_vocal = _role_type_value(role.get("roleType")) == "vocal" or role_id == "lead-vocal"
        vocal_rank = 0 if is_vocal else 1
        ranked.append((PRIORITY_RANK[priority], vocal_rank, role_id, role))
    if not ranked:
        return None
    ranked.sort(key=lambda item: (item[0], item[1], item[2]))
    return ranked[0][3]


def derive_beat_times(mix: Any, sr: Any) -> list[float] | None:
    """Return beat times from an in-memory mix using existing librosa beat tracking.

    Security Notes:
        In-memory only. Malformed mix or sample-rate values fail closed. This
        reuses ``librosa.beat.beat_track`` already owned by ``TemporalAnalyzer``;
        it does not introduce a new MIR product.
    """
    try:
        import librosa

        if not isinstance(sr, int) or isinstance(sr, bool) or sr <= 0:
            return None
        if not hasattr(mix, "size") or int(getattr(mix, "size", 0)) <= 0:
            return None
        _tempo, beat_frames = librosa.beat.beat_track(y=mix, sr=sr)
        times = librosa.frames_to_time(beat_frames, sr=sr)
        derived = [float(time) for time in times]
        return derived if derived else None
    except (TypeError, ValueError, RuntimeError, AttributeError, ImportError):
        return None


def apply_accelerando_plan(
    song: Mapping[str, Any],
    beat_times: Sequence[float] | None,
    section_boundaries: Sequence[Sequence[float]] | None = None,
) -> None:
    """Attach the first corroborated accelerando plan, failing closed on bad input.

    Args:
        song: Mutable rehearsal-song mapping with section/role topology.
        beat_times: Beat onset times in seconds used by tempo-stability.
        section_boundaries: Optional unrounded section boundaries aligned to sections.
    """
    if (
        beat_times is None
        or not isinstance(beat_times, Sequence)
        or isinstance(beat_times, (str, bytes))
    ):
        return
    try:
        stability = analyze_tempo_stability(beat_times)
        change = first_accelerando(stability.get("tempo_changes"))
        if change is None:
            return
        copy = accelerando_plan_copy(change["from_bpm"], change["to_bpm"])
        if copy is None:
            return
        sections = song.get("sections")
        if not isinstance(sections, list):
            return
        for section_index, section in enumerate(sections):
            precise_boundary = None
            if (
                section_boundaries is not None
                and isinstance(section_boundaries, Sequence)
                and not isinstance(section_boundaries, (str, bytes))
                and section_index < len(section_boundaries)
            ):
                precise_boundary = section_boundaries[section_index]
            if not isinstance(section, Mapping) or not _section_contains(
                section, change["time"], precise_boundary
            ):
                continue
            landing = _pick_landing_role(section)
            if landing is None:
                return
            roles = section.get("roles")
            if not isinstance(roles, list):
                return
            for index, role in enumerate(roles):
                if role is not landing:
                    continue
                stamped = dict(landing)
                stamped["accelerandoPlan"] = copy
                stamped["accelerandoPlanSource"] = "model"
                stamped["accelerandoPlanAtSeconds"] = change["time"]
                roles[index] = stamped
                return
            return
    except (TypeError, ValueError, KeyError, AttributeError):
        return
