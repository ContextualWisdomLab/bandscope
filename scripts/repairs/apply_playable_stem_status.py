#!/usr/bin/env python3
"""Apply the reviewed path-free playable-stem status integration exactly once.

The script exists only to make a large-file source repair reviewable while the
GitHub connector cannot apply a unified patch. It fails closed when any expected
source marker has moved and is deleted by its owning workflow after verification.
"""

from __future__ import annotations

from pathlib import Path


API_PATH = Path("services/analysis-engine/src/bandscope_analysis/api.py")


def replace_once(source_text: str, old_text: str, new_text: str, label: str) -> str:
    """Replace one exact source fragment or fail before mutating the file."""
    occurrence_count = source_text.count(old_text)
    if occurrence_count != 1:
        raise RuntimeError(
            f"Expected exactly one {label} source fragment, found {occurrence_count}."
        )
    return source_text.replace(old_text, new_text, 1)


def main() -> None:
    """Patch the analysis status boundary without changing unrelated source."""
    api_text = API_PATH.read_text(encoding="utf-8")

    api_text = replace_once(
        api_text,
        "from bandscope_analysis.separation import AudioStemSeparator\n",
        "from bandscope_analysis.separation import (\n"
        "    AudioStemSeparator,\n"
        "    PlayableStemArtifactSetReference,\n"
        "    build_playable_stem_artifact_set_reference,\n"
        "    materialize_playable_stem_artifact_set,\n"
        ")\n",
        "source-separation import",
    )

    api_text = replace_once(
        api_text,
        "    result: NotRequired[RehearsalSong]\n"
        "    error: NotRequired[AnalysisJobError]\n",
        "    result: NotRequired[RehearsalSong]\n"
        "    error: NotRequired[AnalysisJobError]\n"
        "    playableStemArtifactSet: NotRequired[PlayableStemArtifactSetReference]\n",
        "analysis status contract",
    )

    api_text = replace_once(
        api_text,
        "    result: RehearsalSong | None = None,\n"
        "    error: AnalysisJobError | None = None,\n"
        ") -> AnalysisJobStatus:\n",
        "    result: RehearsalSong | None = None,\n"
        "    error: AnalysisJobError | None = None,\n"
        "    playable_stem_artifact_set: PlayableStemArtifactSetReference | None = None,\n"
        ") -> AnalysisJobStatus:\n",
        "job-status builder signature",
    )

    api_text = replace_once(
        api_text,
        "    if error is not None:\n"
        "        status[\"error\"] = error\n"
        "    return status\n",
        "    if error is not None:\n"
        "        status[\"error\"] = error\n"
        "    if playable_stem_artifact_set is not None:\n"
        "        status[\"playableStemArtifactSet\"] = playable_stem_artifact_set\n"
        "    return status\n",
        "job-status artifact projection",
    )

    api_text = replace_once(
        api_text,
        "    return Path(temp_root) / \"stem-work-v1\" / f\"{digest}.npz\"\n\n\n"
        "def _load_cached_analysis(path: Path) -> RehearsalSong | None:\n",
        "    return Path(temp_root) / \"stem-work-v1\" / f\"{digest}.npz\"\n\n\n"
        "def _materialize_playable_stem_artifact_reference(\n"
        "    request: AnalysisJobRequest,\n"
        "    audio_features: dict[str, Any] | None,\n"
        ") -> PlayableStemArtifactSetReference | None:\n"
        "    \"\"\"Publish aligned stem media and return only path-free status metadata.\"\"\"\n"
        "    if request[\"sourceKind\"] != \"local_audio\" or audio_features is None:\n"
        "        return None\n"
        "    temp_root = request.get(\"tempRoot\")\n"
        "    stem_work_path = _stem_work_arrays_path(request)\n"
        "    stem_arrays = audio_features.get(\"stems\")\n"
        "    if not temp_root or stem_work_path is None or not isinstance(stem_arrays, dict):\n"
        "        return None\n"
        "    try:\n"
        "        native_artifact_set = materialize_playable_stem_artifact_set(\n"
        "            stem_arrays=stem_arrays,\n"
        "            sample_rate_hz=audio_features.get(\"sr\"),\n"
        "            artifact_root=Path(temp_root),\n"
        "            artifact_set_id=stem_work_path.stem,\n"
        "        )\n"
        "    except (OSError, ValueError):\n"
        "        logger.warning(\n"
        "            \"Playable stem artifact publication failed; stems remain unavailable.\"\n"
        "        )\n"
        "        return None\n"
        "    return build_playable_stem_artifact_set_reference(native_artifact_set)\n\n\n"
        "def _load_cached_analysis(path: Path) -> RehearsalSong | None:\n",
        "playable artifact helper",
    )

    api_text = replace_once(
        api_text,
        "    cache_path = _analysis_cache_path(request)\n"
        "    cache_status: AnalysisCacheStatus = \"disabled\" if cache_path is None else \"miss\"\n"
        "    if cache_path is not None:\n"
        "        cached_result = _load_cached_analysis(cache_path)\n"
        "        if cached_result is not None:\n"
        "            return [\n",
        "    cache_path = _analysis_cache_path(request)\n"
        "    feature_cache_paths = _feature_cache_paths(request)\n"
        "    cache_status: AnalysisCacheStatus = \"disabled\" if cache_path is None else \"miss\"\n"
        "    if cache_path is not None:\n"
        "        cached_result = _load_cached_analysis(cache_path)\n"
        "        if cached_result is not None:\n"
        "            cached_artifact_reference = None\n"
        "            if feature_cache_paths is not None:\n"
        "                cached_features = _load_cached_local_audio_features(*feature_cache_paths)\n"
        "                cached_artifact_reference = _materialize_playable_stem_artifact_reference(\n"
        "                    request, cached_features\n"
        "                )\n"
        "            return [\n",
        "analysis cache artifact restoration",
    )

    api_text = replace_once(
        api_text,
        "                    cache_status=\"hit\",\n"
        "                    result=cached_result,\n"
        "                ),\n"
        "            ]\n\n"
        "    decode_label = (\n",
        "                    cache_status=\"hit\",\n"
        "                    result=cached_result,\n"
        "                    playable_stem_artifact_set=cached_artifact_reference,\n"
        "                ),\n"
        "            ]\n\n"
        "    decode_label = (\n",
        "cached terminal artifact status",
    )

    api_text = replace_once(
        api_text,
        "    feature_cache_paths = _feature_cache_paths(request)\n"
        "    updates = [\n",
        "    updates = [\n",
        "duplicate feature-cache initialization",
    )

    api_text = replace_once(
        api_text,
        "            return updates\n\n"
        "    updates.append(\n"
        "        _build_job_status(\n"
        "            job_id=job_id,\n"
        "            state=\"running\",\n"
        "            requested_at=requested_at,\n"
        "            progress_label=\"Building rehearsal cues\",\n",
        "            return updates\n\n"
        "    playable_stem_artifact_set = _materialize_playable_stem_artifact_reference(\n"
        "        request, audio_features\n"
        "    )\n\n"
        "    updates.append(\n"
        "        _build_job_status(\n"
        "            job_id=job_id,\n"
        "            state=\"running\",\n"
        "            requested_at=requested_at,\n"
        "            progress_label=\"Building rehearsal cues\",\n",
        "fresh terminal artifact materialization",
    )

    api_text = replace_once(
        api_text,
        "            cache_status=final_cache_status,\n"
        "            result=result,\n"
        "        )\n"
        "    )\n",
        "            cache_status=final_cache_status,\n"
        "            result=result,\n"
        "            playable_stem_artifact_set=playable_stem_artifact_set,\n"
        "        )\n"
        "    )\n",
        "fresh terminal artifact status",
    )

    API_PATH.write_text(api_text, encoding="utf-8")


if __name__ == "__main__":
    main()
