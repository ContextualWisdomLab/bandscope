"""Crash-durability contracts for final rehearsal-result cache publication."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
from typing import Any

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


def test_store_durable_cache_cleans_stage_when_publication_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failed durable publish leaves no orphaned final-result staging file."""
    target = tmp_path / "analysis.json"

    monkeypatch.setattr(final_result_cache.os, "fsync", lambda _fd: None)
    monkeypatch.setattr(
        final_result_cache,
        "_publish_synced_cache_stage",
        lambda _stage, _target: (_ for _ in ()).throw(OSError("disk sync failed")),
    )

    with pytest.raises(OSError, match="disk sync failed"):
        final_result_cache.store_durable_cache_payload(target, {"schemaVersion": 1})

    assert list(tmp_path.iterdir()) == []


def test_store_durable_cache_propagates_stage_creation_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Failure before a staging path exists is propagated without inventing cleanup state."""
    target = tmp_path / "analysis.json"

    def fail_named_temporary_file(**_kwargs: object) -> Any:
        raise OSError("stage creation failed")

    monkeypatch.setattr(
        final_result_cache.tempfile,
        "NamedTemporaryFile",
        fail_named_temporary_file,
    )

    with pytest.raises(OSError, match="stage creation failed"):
        final_result_cache.store_durable_cache_payload(target, {"schemaVersion": 1})

    assert list(tmp_path.iterdir()) == []


def test_sync_parent_directory_closes_descriptor_after_flush(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Directory durability does not leak its descriptor after a successful flush."""
    events: list[tuple[str, object]] = []

    monkeypatch.setattr(
        final_result_cache.os,
        "open",
        lambda path, flags: events.append(("open", (path, flags))) or 41,
    )
    monkeypatch.setattr(
        final_result_cache.os,
        "fsync",
        lambda fd: events.append(("fsync", fd)),
    )
    monkeypatch.setattr(
        final_result_cache.os,
        "close",
        lambda fd: events.append(("close", fd)),
    )

    final_result_cache._sync_parent_directory(tmp_path)

    assert [event[0] for event in events] == ["open", "fsync", "close"]
    assert events[1:] == [("fsync", 41), ("close", 41)]


def test_sync_parent_directory_closes_descriptor_when_flush_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failed directory flush still closes the descriptor and propagates failure."""
    closed: list[int] = []
    monkeypatch.setattr(final_result_cache.os, "open", lambda _path, _flags: 52)
    monkeypatch.setattr(
        final_result_cache.os,
        "fsync",
        lambda _fd: (_ for _ in ()).throw(OSError("directory fsync failed")),
    )
    monkeypatch.setattr(final_result_cache.os, "close", closed.append)

    with pytest.raises(OSError, match="directory fsync failed"):
        final_result_cache._sync_parent_directory(tmp_path)

    assert closed == [52]


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


def test_windows_cache_publication_uses_write_through_move(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Windows publication uses replace-existing plus write-through rather than plain rename."""
    stage = tmp_path / ".cache.stage"
    target = tmp_path / "analysis.json"
    calls: list[tuple[str, str, int]] = []

    class MoveFileExWMock:
        argtypes: object = None
        restype: object = None

        def __call__(self, source: str, destination: str, flags: int) -> int:
            calls.append((source, destination, flags))
            return 1

    class Kernel32:
        MoveFileExW = MoveFileExWMock()

    monkeypatch.setattr(ctypes, "WinDLL", lambda *_args, **_kwargs: Kernel32(), raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: 5, raising=False)

    final_result_cache._replace_windows_write_through(stage, target)

    assert calls == [(str(stage), str(target), 0x00000001 | 0x00000008)]


def test_windows_cache_publication_propagates_move_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Windows write-through failures remain explicit durability failures."""
    stage = tmp_path / ".cache.stage"
    target = tmp_path / "analysis.json"

    class MoveFileExWMock:
        argtypes: object = None
        restype: object = None

        def __call__(self, _source: str, _destination: str, _flags: int) -> int:
            return 0

    class Kernel32:
        MoveFileExW = MoveFileExWMock()

    monkeypatch.setattr(ctypes, "WinDLL", lambda *_args, **_kwargs: Kernel32(), raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: 5, raising=False)

    with pytest.raises(OSError) as error:
        final_result_cache._replace_windows_write_through(stage, target)

    assert error.value.errno == 5


def test_windows_cache_publication_fails_closed_without_win32_bindings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A missing Win32 binding cannot silently downgrade to a non-durable rename."""
    monkeypatch.setattr(ctypes, "WinDLL", None, raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", None, raising=False)

    with pytest.raises(OSError, match="write-through publication is unavailable"):
        final_result_cache._replace_windows_write_through(
            tmp_path / ".cache.stage",
            tmp_path / "analysis.json",
        )


def test_publish_synced_cache_stage_dispatches_windows_owner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The platform dispatcher never falls through to POSIX replacement on Windows."""
    stage = tmp_path / ".cache.stage"
    target = tmp_path / "analysis.json"
    calls: list[tuple[Path, Path]] = []

    monkeypatch.setattr(final_result_cache.os, "name", "nt")
    monkeypatch.setattr(
        final_result_cache,
        "_replace_windows_write_through",
        lambda source, destination: calls.append((source, destination)),
    )
    monkeypatch.setattr(
        final_result_cache.os,
        "replace",
        lambda *_args: pytest.fail("Windows publication fell through to os.replace"),
    )

    final_result_cache._publish_synced_cache_stage(stage, target)

    assert calls == [(stage, target)]


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
        "bandscope_analysis.api.store_durable_cache_payload",
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
