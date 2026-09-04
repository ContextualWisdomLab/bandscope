"""Project signal-derived full-band cuts into rehearsal section cues.

The structural segmenter intentionally models musical form at multi-second
resolution, while stop-time detection models short full-band coordination
breaks. This adapter keeps those responsibilities separate: it never relabels
or rewrites a structural section. Instead, a validated stop-time moment becomes
an additional ``stop`` rehearsal cue section anchored inside the structural
section that owns the cut.

Security Notes:
- Operates only on already-decoded in-memory stem arrays and analysis payloads.
- Does no file, network, subprocess, model, or persistence I/O.
- Invalid timing, malformed section ranges, and unanchored moments are dropped.
- Synthetic cue ids are deterministic and collision-safe within one song.
"""

from __future__ import annotations

import copy
import math
from collections.abc import Callable
from typing import Any, TypeVar, cast

from .temporal.hits import detect_stop_time

SongT = TypeVar("SongT", bound=dict[str, Any])
BuildSong = Callable[[dict[str, Any] | None], SongT]


def _valid_section_range(section: object) -> tuple[int, int] | None:
    """Return a bounded positive integer section range from untrusted payload data."""
    if not isinstance(section, dict):
        return None
    time_range = section.get("timeRange")
    if not isinstance(time_range, dict):
        return None
    start = time_range.get("start")
    end = time_range.get("end")
    if (
        not isinstance(start, int)
        or isinstance(start, bool)
        or not isinstance(end, int)
        or isinstance(end, bool)
        or start < 0
        or end <= start
    ):
        return None
    return start, end


def _owning_section(sections: list[object], start_time: float) -> dict[str, Any] | None:
    """Find the structural section whose half-open range owns a stop start time."""
    for section in sections:
        section_range = _valid_section_range(section)
        if section_range is None or not isinstance(section, dict):
            continue
        start, end = section_range
        if start <= start_time < end:
            return section
    return None


def _covered_by_existing_stop(sections: list[object], start_time: float) -> bool:
    """Avoid duplicating a stop that a future structural pipeline already emits."""
    for section in sections:
        if not isinstance(section, dict) or section.get("label") != "stop":
            continue
        section_range = _valid_section_range(section)
        if section_range is None:
            continue
        start, end = section_range
        if start <= start_time < end:
            return True
    return False


def project_detected_stop_sections(
    song: SongT,
    audio_features: dict[str, Any] | None,
) -> SongT:
    """Add deterministic rehearsal cue sections for validated full-band stop moments.

    Stop-time detection keeps its native 100 ms analysis resolution. The current
    shared section contract is whole-second ``u32`` timing, so the cue section is
    conservatively quantized to the containing structural section: floor the
    detected start, ceil the detected end, and keep at least one second. The
    detector's scientific output is not reinterpreted as a form label; the
    additional ``stop`` section is explicitly a rehearsal cue projection.
    """
    if not isinstance(song, dict) or not isinstance(audio_features, dict):
        return song

    stems = audio_features.get("stems")
    sr = audio_features.get("sr")
    sections_value = song.get("sections")
    if not isinstance(stems, dict) or not stems or not isinstance(sr, int) or sr <= 0:
        return song
    if not isinstance(sections_value, list) or not sections_value:
        return song

    moments = detect_stop_time(stems, sr)
    if not moments:
        return song

    sections = list(sections_value)
    existing_ids = {
        section.get("id")
        for section in sections
        if isinstance(section, dict) and isinstance(section.get("id"), str)
    }
    projected: list[dict[str, Any]] = []
    next_id = 1

    for moment in moments:
        start_time = moment.get("start_time")
        end_time = moment.get("end_time")
        if (
            not isinstance(start_time, (int, float))
            or isinstance(start_time, bool)
            or not isinstance(end_time, (int, float))
            or isinstance(end_time, bool)
        ):
            continue
        start_time = float(start_time)
        end_time = float(end_time)
        if not math.isfinite(start_time) or not math.isfinite(end_time):
            continue
        if start_time < 0 or end_time <= start_time:
            continue
        if _covered_by_existing_stop(sections, start_time):
            continue

        owner = _owning_section(sections, start_time)
        owner_range = _valid_section_range(owner)
        if owner is None or owner_range is None:
            continue
        owner_start, owner_end = owner_range

        cue_start = max(owner_start, math.floor(start_time))
        cue_end = min(owner_end, max(cue_start + 1, math.ceil(end_time)))
        if cue_end <= cue_start:
            continue

        while f"detected-stop-{next_id}" in existing_ids:
            next_id += 1
        cue_id = f"detected-stop-{next_id}"
        next_id += 1
        existing_ids.add(cue_id)

        cue = copy.deepcopy(owner)
        cue["id"] = cue_id
        cue["label"] = "stop"
        cue["timeRange"] = {"start": int(cue_start), "end": int(cue_end)}
        cue["confidence"] = {
            "level": "low",
            "source": "model",
            "notes": "Detected from a full-band quiet interval; confirm the cut by ear.",
        }
        projected.append(cue)

    if not projected:
        return song

    combined = sections + projected
    combined.sort(
        key=lambda section: (
            (_valid_section_range(section) or (2**63 - 1, 2**63 - 1))[0],
            1 if isinstance(section, dict) and section.get("label") == "stop" else 0,
            str(section.get("id", "")) if isinstance(section, dict) else "",
        )
    )
    result = dict(song)
    result["sections"] = combined
    return cast(SongT, result)


def with_detected_stop_projection(build_song: BuildSong[SongT]) -> BuildSong[SongT]:
    """Decorate the analysis-song builder at the package composition boundary."""
    if getattr(build_song, "__bandscope_stop_projection__", False):
        return build_song

    def wrapped(audio_features: dict[str, Any] | None = None) -> SongT:
        song = build_song(audio_features)
        return project_detected_stop_sections(song, audio_features)

    setattr(wrapped, "__bandscope_stop_projection__", True)
    return wrapped
