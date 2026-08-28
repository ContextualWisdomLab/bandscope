"""Stamp tonight's first fermata plan from an isolated beat-gap hold.

Tempo-stability already ignores a single outlier inter-beat interval so that
only sustained tempo changes are reported. A fermata is that residual: one
isolated hold that is longer than the local median pulse, then the pulse
resumes. The owned ``fermataPlan`` copy lands on the highest-priority active
named vocal or bass in the section that contains that hold. Heuristic/demo
topology stays unnamed. This is not a new MIR product: it only reads the
same beat times already owned by ``analyze_tempo_stability``.

Security Notes:
    Pure in-memory mutation of an already-built rehearsal song. Beat times and
    song topology are untrusted runtime values: malformed numbers, missing
    identity, repeated graph ids, or inactive parts fail closed instead of
    inventing a plan. No file, network, or subprocess I/O.
"""

from __future__ import annotations

from collections.abc import Mapping, MutableMapping, Sequence
from math import isfinite
from typing import Any, TypedDict

from bandscope_analysis.temporal.stability import analyze_tempo_stability

FERMATA_RATIO_MIN = 1.75
FERMATA_RATIO_MAX = 3.5
NEIGHBOR_RATIO_MAX = 1.2
TEMPO_CHANGE_GUARD_SECONDS = 1.5
MIN_HOLD_SECONDS = 0.25
MAX_HOLD_SECONDS = 8.0
NAMED_FERMATA_ROLE_IDS = frozenset({"bass-guitar", "lead-vocal"})
PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
FERMATA_PLAN_PREFIX = "Hold this part through the extra "
FERMATA_PLAN_SUFFIX = " s; wait for the cutoff before the next entrance."


class FermataHold(TypedDict):
    """An isolated beat-gap hold that is not a sustained tempo change."""

    time: float
    hold_seconds: float


def format_fermata_hold(value: float) -> str | None:
    """Return a buyer-facing extra-hold token, or None when the value is unusable."""
    if not isfinite(value) or value < MIN_HOLD_SECONDS or value > MAX_HOLD_SECONDS:
        return None
    rounded = round(float(value), 1)
    if rounded < MIN_HOLD_SECONDS or rounded > MAX_HOLD_SECONDS:
        return None
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.1f}"


def fermata_plan_copy(hold_seconds: float) -> str | None:
    """Return the owned model fermata copy, or None when the hold token is unusable."""
    token = format_fermata_hold(hold_seconds)
    if token is None:
        return None
    return f"{FERMATA_PLAN_PREFIX}{token}{FERMATA_PLAN_SUFFIX}"


def is_fermata_hold(hold: Mapping[str, Any]) -> bool:
    """Return whether a candidate is an isolated extra-duration hold."""
    time = hold.get("time")
    hold_seconds = hold.get("hold_seconds")
    if not isinstance(time, (int, float)) or isinstance(time, bool):
        return False
    if not isinstance(hold_seconds, (int, float)) or isinstance(hold_seconds, bool):
        return False
    if not isfinite(time) or time < 0:
        return False
    if (
        not isfinite(hold_seconds)
        or hold_seconds < MIN_HOLD_SECONDS
        or hold_seconds > MAX_HOLD_SECONDS
    ):
        return False
    return True


def _interval_near_median(interval: float, median: float) -> bool:
    """Return whether one inter-beat interval sits close to the median pulse."""
    if median <= 0 or not isfinite(interval) or interval <= 0:
        return False
    ratio = interval / median
    return ratio <= NEIGHBOR_RATIO_MAX


def first_fermata(beat_times: Sequence[float] | None) -> FermataHold | None:
    """Return the earliest isolated hold, or None when none is corroborated."""
    if (
        beat_times is None
        or not isinstance(beat_times, Sequence)
        or isinstance(beat_times, (str, bytes))
    ):
        return None
    times: list[float] = []
    for item in beat_times:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            return None
        value = float(item)
        if not isfinite(value) or value < 0:
            return None
        if times and value <= times[-1]:
            return None
        times.append(value)
    if len(times) < 8:
        return None
    intervals = [times[index + 1] - times[index] for index in range(len(times) - 1)]
    ordered = sorted(intervals)
    median = ordered[len(ordered) // 2]
    try:
        stability = analyze_tempo_stability(times)
        change_times = [
            float(change["time"])
            for change in stability.get("tempo_changes", [])
            if isinstance(change, Mapping)
            and isinstance(change.get("time"), (int, float))
            and not isinstance(change.get("time"), bool)
            and isfinite(change["time"])
        ]
    except (TypeError, ValueError, KeyError, AttributeError):
        change_times = []
    for index, interval in enumerate(intervals):
        ratio = interval / median
        if ratio < FERMATA_RATIO_MIN or ratio > FERMATA_RATIO_MAX:
            continue
        extra = interval - median
        if extra < MIN_HOLD_SECONDS or extra > MAX_HOLD_SECONDS:
            continue
        previous_ok = index == 0 or _interval_near_median(intervals[index - 1], median)
        next_ok = index + 1 >= len(intervals) or _interval_near_median(intervals[index + 1], median)
        if not previous_ok or not next_ok:
            continue
        time = times[index]
        if any(
            abs(time - change_time) < TEMPO_CHANGE_GUARD_SECONDS for change_time in change_times
        ):
            continue
        if not is_fermata_hold({"time": time, "hold_seconds": extra}):
            continue
        return {"time": float(time), "hold_seconds": float(extra)}
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
    """Return whether a role is a named vocal or bass that may own a fermata."""
    role_id = role.get("id")
    if not isinstance(role_id, str) or role_id.strip() == "":
        return False
    if role_id in NAMED_FERMATA_ROLE_IDS:
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


def _section_contains(section: Mapping[str, Any], time: float) -> bool:
    """Return whether a section window contains a fermata hold time."""
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


def apply_fermata_plan(song: Mapping[str, Any], beat_times: Sequence[float] | None) -> None:
    """Attach the first corroborated fermata plan, failing closed on bad input.

    Args:
        song: Mutable rehearsal-song mapping with section/role topology.
        beat_times: Beat onset times in seconds used by tempo-stability.
    """
    hold = first_fermata(beat_times)
    if hold is None:
        return
    copy = fermata_plan_copy(hold["hold_seconds"])
    if copy is None:
        return
    try:
        sections = song.get("sections")
        if not isinstance(sections, list):
            return
        for section in sections:
            if not isinstance(section, Mapping) or not _section_contains(section, hold["time"]):
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
                stamped["fermataPlan"] = copy
                stamped["fermataPlanSource"] = "model"
                stamped["fermataPlanAtSeconds"] = hold["time"]
                roles[index] = stamped
                return
            return
    except (TypeError, ValueError, KeyError, AttributeError):
        return
