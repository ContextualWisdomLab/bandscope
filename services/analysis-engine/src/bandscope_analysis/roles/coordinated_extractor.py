"""Cross-role rehearsal extraction that binds temporal stop-time to stable section cards."""

from __future__ import annotations

from typing import Any

from ..temporal import hits as temporal_hits
from .extractor import RoleExtractor as CoreRoleExtractor
from .model import RoleExtractionResult


def _apply_stop_time_section_labels(
    section_candidates: list[Any],
    audio_features: dict[str, Any] | None,
) -> None:
    """Map each detected all-stem cutoff onto the stable section immediately before re-entry.

    Stop-time is detected from separated stems, while structural segmentation owns
    stable section identities and ranges.  The first boundary range containing a
    stop's start time is therefore the rehearsal card that owns the cut.  Exact
    boundary starts deliberately resolve to the preceding range so the next card
    remains the re-entry destination.  Only the form label changes; stable section
    identity, timing, role topology, and persisted wire keys remain unchanged.
    """
    analysis_features = audio_features or {}
    audio_stems = analysis_features.get("stems")
    sample_rate = analysis_features.get("sr")
    section_boundaries = analysis_features.get("boundaries")

    if not isinstance(audio_stems, dict) or not audio_stems:
        return
    if not isinstance(sample_rate, int) or isinstance(sample_rate, bool) or sample_rate <= 0:
        return
    if not isinstance(section_boundaries, list) or len(section_boundaries) != len(section_candidates):
        return

    stop_time_moments = temporal_hits.detect_stop_time(audio_stems, sample_rate)
    for stop_time_moment in stop_time_moments:
        if not isinstance(stop_time_moment, dict):
            continue
        stop_start_time = stop_time_moment.get("start_time")
        if isinstance(stop_start_time, bool) or not isinstance(stop_start_time, (int, float)):
            continue

        for section_index, section_boundary in enumerate(section_boundaries):
            if not isinstance(section_boundary, (tuple, list)) or len(section_boundary) != 2:
                continue
            section_start_time, section_end_time = section_boundary
            if (
                isinstance(section_start_time, bool)
                or isinstance(section_end_time, bool)
                or not isinstance(section_start_time, (int, float))
                or not isinstance(section_end_time, (int, float))
            ):
                continue
            if section_start_time <= stop_start_time <= section_end_time:
                section_candidate = section_candidates[section_index]
                if isinstance(section_candidate, dict):
                    section_candidate["form_label"] = "stop"
                break


class CoordinatedRoleExtractor(CoreRoleExtractor):
    """Role extractor that first binds cross-role stop-time evidence to section form."""

    def extract(
        self,
        section_candidates: list[Any],
        audio_features: dict[str, Any] | None = None,
    ) -> RoleExtractionResult:
        """Extract role topology after mapping all-stem cutoffs onto stable section cards."""
        _apply_stop_time_section_labels(section_candidates, audio_features)
        return super().extract(section_candidates, audio_features)
