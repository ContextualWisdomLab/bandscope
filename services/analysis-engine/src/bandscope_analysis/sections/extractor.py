"""Pipeline logic for extracting section candidates from song arrangements."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, TypedDict

import numpy as np

from .anchors import count_based_anchor, lyric_phrase_anchor
from .model import (
    ALL_SECTION_LABELS,
    SectionCandidate,
    SectionExtractionResult,
)

# Sort by length descending to match longest possible prefix first if needed,
# though ALL_SECTION_LABELS currently are distinct.
_sorted_labels = sorted(ALL_SECTION_LABELS, key=len, reverse=True)
_LABEL_PREFIX_PATTERN = re.compile(
    r"^(" + "|".join(re.escape(label) for label in _sorted_labels) + r")"
)
_SEGMENT_LABEL_PATTERN = (
    "intro",
    "verse",
    "chorus",
    "verse",
    "chorus",
    "bridge",
    "chorus",
    "outro",
    "tag",
)


class StructuralSectionExtractionResult(TypedDict):
    """Section extraction with aligned timing and harmony metadata."""

    extraction: SectionExtractionResult
    boundaries: list[tuple[float, float]]
    dominant_chords: list[str]


def _normalize_label(raw_label: str) -> str:
    """Normalize a string to a SectionLabel if possible."""
    normalized = str(raw_label).lower().strip()
    # Handle variations (e.g. "verse 1" -> "verse")
    match = _LABEL_PREFIX_PATTERN.match(normalized)
    if match:
        return match.group(1)
    return normalized


def extract_sections(arrangement: List[Dict[str, Any]]) -> SectionExtractionResult:
    """
    Extract structured section candidates from raw arrangement data.

    Expects arrangement list of dicts with at least:
    - label: str
    - groove: str (optional)
    - lyric_cue: str (optional)
    """
    sections: List[SectionCandidate] = []

    # Determine dominant strategy: if any item has lyric_cue, use LYRIC strategy
    has_lyrics = any(item.get("lyric_cue") for item in arrangement)
    dominant_strategy = "lyric" if has_lyrics else "count"

    label_counts: Dict[str, int] = {}

    for item in arrangement:
        raw_label = item.get("label", "unknown")
        form_label = _normalize_label(raw_label)

        # Track sequence index per form label (e.g. verse-1, verse-2)
        # Note: we want 1-based index but the type implies we just count them
        label_counts[form_label] = label_counts.get(form_label, 0) + 1
        sequence_index = label_counts[form_label]

        section_id = f"{form_label}-{sequence_index}"

        # Determine confidence
        confidence_level: Literal["low", "medium", "high"] = "low"
        confidence_source: Literal["model", "user"] = "model"

        if form_label in ALL_SECTION_LABELS:
            confidence_level = "high"
            confidence_source = "model"
            confidence_notes = "Recognized standard section label"
        else:
            confidence_level = "low"
            confidence_source = "model"
            confidence_notes = "Unrecognized section label"

        # Create anchor
        if has_lyrics and "lyric_cue" in item and item["lyric_cue"]:
            anchor = lyric_phrase_anchor(item["lyric_cue"])
        else:
            # Fallback or default count anchor
            anchor = count_based_anchor(beat=1, bar=1)

        candidate: SectionCandidate = {
            "id": section_id,
            "form_label": form_label,
            "sequence_index": sequence_index,
            "groove": item.get("groove", "standard"),
            "confidence_level": confidence_level,
            "confidence_source": confidence_source,
            "confidence_notes": confidence_notes,
            "cue_anchor": anchor,
        }
        sections.append(candidate)

    return {
        "sections": sections,
        "strategy_used": dominant_strategy,
        "extraction_notes": f"Extracted {len(sections)} sections using {dominant_strategy}.",
    }


def extract_structural_sections(
    audio_features: dict[str, Any] | None,
    lyric_cues: list[str] | None = None,
) -> StructuralSectionExtractionResult:
    """Extract timed sections from novelty on beat-synchronous stem features."""
    features = audio_features or {}
    temporal = features.get("temporal")
    if not isinstance(temporal, dict):
        fallback = extract_sections([{"label": "verse", "groove": "steady pocket"}])
        return {
            "extraction": fallback,
            "boundaries": [(0.0, 16.0)],
            "dominant_chords": ["N"],
        }

    duration = float(temporal.get("duration_seconds", 16.0))
    downbeats = _sanitize_times(temporal.get("downbeat_times"), duration)
    if len(downbeats) < 3:
        downbeats = _fallback_downbeats(temporal.get("beat_times"), duration)
    if len(downbeats) < 3:
        downbeats = [0.0, max(1.0, duration / 2.0), max(2.0, duration)]

    boundaries = _novelty_boundaries(features, downbeats, duration)
    timed_sections = _build_sections_from_boundaries(features, boundaries, lyric_cues or [])

    return timed_sections


def _fallback_downbeats(beat_times: object, duration_seconds: float) -> list[float]:
    beats = _sanitize_times(beat_times, duration_seconds)
    if not beats:
        return []
    downbeats = [beats[index] for index in range(0, len(beats), 4)]
    if downbeats[-1] < duration_seconds:
        downbeats.append(duration_seconds)
    return downbeats


def _sanitize_times(raw_times: object, duration_seconds: float) -> list[float]:
    if not isinstance(raw_times, list):
        return []
    times = []
    for value in raw_times:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            clamped = min(max(0.0, float(value)), max(duration_seconds, 0.0))
            times.append(clamped)
    if not times:
        return []
    unique_sorted = sorted(set(times))
    if unique_sorted[0] > 0.0:
        unique_sorted.insert(0, 0.0)
    if unique_sorted[-1] < duration_seconds:
        unique_sorted.append(duration_seconds)
    return unique_sorted


def _novelty_boundaries(
    features: dict[str, Any], downbeats: list[float], duration_seconds: float
) -> list[tuple[float, float]]:
    stems = features.get("stems")
    sample_rate = features.get("sr", 44_100)
    if not isinstance(stems, dict) or not isinstance(sample_rate, int) or sample_rate <= 0:
        return _downbeats_to_boundaries(downbeats, duration_seconds)

    interval_features = []
    dominant_chords = _section_dominant_chords(features.get("chords"), downbeats)
    for index, (start, end) in enumerate(
        zip(downbeats[:-1], downbeats[1:], strict=False)
    ):
        frame = _stem_energy_frame(stems, sample_rate, start, end)
        frame.append(
            1.0
            if index > 0 and dominant_chords[index] != dominant_chords[index - 1]
            else 0.0
        )
        interval_features.append(frame)

    if len(interval_features) < 2:
        return _downbeats_to_boundaries(downbeats, duration_seconds)

    feature_matrix = np.asarray(interval_features, dtype=np.float64)
    changes = np.linalg.norm(np.diff(feature_matrix, axis=0), axis=1)
    if changes.size == 0:
        return _downbeats_to_boundaries(downbeats, duration_seconds)

    threshold = float(np.mean(changes) + 0.6 * np.std(changes))
    boundary_indices = [0]
    last_cut = 0
    for idx, novelty in enumerate(changes, start=1):
        if novelty >= threshold and (idx - last_cut) >= 2:
            boundary_indices.append(idx)
            last_cut = idx
    if boundary_indices[-1] != len(downbeats) - 1:
        boundary_indices.append(len(downbeats) - 1)

    section_boundaries = []
    for left, right in zip(boundary_indices[:-1], boundary_indices[1:], strict=False):
        start = downbeats[left]
        end = downbeats[right]
        if end <= start:
            continue
        section_boundaries.append((start, min(end, duration_seconds)))
    return section_boundaries or _downbeats_to_boundaries(downbeats, duration_seconds)


def _downbeats_to_boundaries(
    downbeats: list[float], duration_seconds: float
) -> list[tuple[float, float]]:
    boundaries: list[tuple[float, float]] = []
    for start, end in zip(downbeats[:-1], downbeats[1:], strict=False):
        if end > start:
            boundaries.append((start, min(end, duration_seconds)))
    return boundaries or [(0.0, max(1.0, duration_seconds))]


def _stem_energy_frame(
    stems: dict[str, Any],
    sample_rate: int,
    start_time: float,
    end_time: float,
) -> list[float]:
    start_idx = max(0, int(round(start_time * sample_rate)))
    end_idx = max(start_idx + 1, int(round(end_time * sample_rate)))
    frame: list[float] = []
    for stem_name in ("vocals", "bass", "drums", "other"):
        stem = stems.get(stem_name)
        if not isinstance(stem, np.ndarray) or stem.size == 0:
            frame.append(0.0)
            continue
        bounded_end = min(end_idx, stem.size)
        bounded_start = min(start_idx, max(0, bounded_end - 1))
        chunk = stem[bounded_start:bounded_end]
        if chunk.size == 0:
            frame.append(0.0)
        else:
            frame.append(float(np.sqrt(np.mean(np.square(np.asarray(chunk, dtype=np.float64))))))
    return frame


def _build_sections_from_boundaries(
    features: dict[str, Any],
    boundaries: list[tuple[float, float]],
    lyric_cues: list[str],
) -> StructuralSectionExtractionResult:
    bpm = 0.0
    temporal = features.get("temporal")
    if isinstance(temporal, dict):
        bpm = float(temporal.get("bpm", 0.0))
    boundary_points = [b[0] for b in boundaries] + [boundaries[-1][1]]
    dominant_chords = _section_dominant_chords(features.get("chords"), boundary_points)

    arrangement: list[dict[str, Any]] = []
    for index, (start, end) in enumerate(boundaries):
        label = _SEGMENT_LABEL_PATTERN[index] if index < len(_SEGMENT_LABEL_PATTERN) else "tag"
        chord = dominant_chords[index] if index < len(dominant_chords) else "N"
        groove = f"{round(bpm):.0f} BPM pocket, {chord} center, {max(1.0, end - start):.1f}s"
        section_row: dict[str, Any] = {"label": label, "groove": groove}
        if index < len(lyric_cues) and lyric_cues[index]:
            section_row["lyric_cue"] = lyric_cues[index]
        arrangement.append(section_row)

    extraction = extract_sections(arrangement)
    return {
        "extraction": extraction,
        "boundaries": boundaries,
        "dominant_chords": dominant_chords[: len(boundaries)],
    }


def _section_dominant_chords(chords: object, boundary_points: list[float]) -> list[str]:
    if not isinstance(chords, list) or len(boundary_points) < 2:
        return ["N"] * max(1, len(boundary_points) - 1)

    normalized = []
    for chord_event in chords:
        if not isinstance(chord_event, dict):
            continue
        chord = chord_event.get("chord")
        start_time = chord_event.get("start_time")
        end_time = chord_event.get("end_time")
        if (
            not isinstance(chord, str)
            or not isinstance(start_time, (int, float))
            or not isinstance(end_time, (int, float))
            or end_time <= start_time
        ):
            continue
        normalized.append((float(start_time), float(end_time), chord))

    if not normalized:
        return ["N"] * max(1, len(boundary_points) - 1)

    dominant: list[str] = []
    for start, end in zip(boundary_points[:-1], boundary_points[1:], strict=False):
        best_chord = "N"
        best_overlap = 0.0
        for c_start, c_end, chord in normalized:
            overlap = max(0.0, min(end, c_end) - max(start, c_start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_chord = chord
        dominant.append(best_chord)
    return dominant
