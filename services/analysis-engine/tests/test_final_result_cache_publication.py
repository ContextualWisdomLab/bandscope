"""Crash-durability contracts for final rehearsal-result cache publication."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import bandscope_analysis.final_result_cache as final_result_cache


def test_store_durable_cache_syncs_staged_bytes_before_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A cache result is publishable only after its staged bytes reach stable storage."""
    target = tmp_path / "analysis.json"
    events: list[str] = []

    def record_fsync(_fd: int) -> None:
        events.append("file-fsync")

    def record_publish(stage: Path, destination: Path) -> None:
        assert stage.parent == destination.parent == tmp_path
        assert stage != destination
        assert stage.read_text(encoding="utf-8") == '{"schemaVersion":1}'
        events.append("publish")

    monkeypatch.setattr(final_result_cache.os, "fsync", record_fsync)
    monkeypatch.setattr(final_result_cache, "_publish_synced_cache_stage", record_publish)

    final_result_cache.store_durable_cache_payload(target, {"schemaVersion": 1})

    assert events == ["file-fsync", "publish"]
    assert list(tmp_path.iterdir()) == []


def test_posix_cache_publication_syncs_parent_after_replace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POSIX publication must durably commit the renamed directory entry before success."""
    if os.name == "nt":
        pytest.skip("POSIX directory-fsync contract")

    stage = tmp_path / ".cache.stage"
    target = tmp_path / "analysis.json"
    stage.write_text("payload", encoding="utf-8")
    events: list[str] = []

    def record_replace(source: Path, destination: Path) -> None:
        assert source == stage
        assert destination == target
        events.append("replace")

    def record_parent_sync(directory: Path) -> None:
        assert directory == tmp_path
        events.append("parent-fsync")

    monkeypatch.setattr(final_result_cache.os, "replace", record_replace)
    monkeypatch.setattr(final_result_cache, "_sync_parent_directory", record_parent_sync)

    final_result_cache._publish_synced_cache_stage(stage, target)

    assert events == ["replace", "parent-fsync"]


def test_cache_publication_failure_is_not_reported_as_stored(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A durability failure must fail closed instead of acknowledging a reusable cache."""
    from bandscope_analysis.api import (
        _store_cached_analysis,
        build_demo_rehearsal_song,
        validate_analysis_job_request,
    )

    request = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-cache",
            "sourceLabel": "late-night-set.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": "/app-owned/project/source.wav",
                "fileName": "late-night-set.wav",
                "extension": "wav",
                "fileSizeBytes": 1024000,
            },
        }
    )
    monkeypatch.setattr(
        "bandscope_analysis.api.admitted_audio_cache_identity",
        lambda: {
            "fileSizeBytes": 1024000,
            "contentSha256": "0" * 64,
            "analysisGeneration": 1,
        },
    )

    def fail_publication(_path: Path, _payload: object) -> None:
        raise OSError("simulated durability failure")

    monkeypatch.setattr(
        final_result_cache,
        "store_durable_cache_payload",
        fail_publication,
    )

    assert (
        _store_cached_analysis(
            tmp_path / "analysis.json",
            request,
            build_demo_rehearsal_song(),
        )
        is False
    )
