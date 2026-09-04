"""Security regressions for analysis filesystem path authority."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

import bandscope_analysis.api as api_module
from bandscope_analysis.api import (
    RehearsalSong,
    _analysis_cache_path,
    _feature_cache_paths,
    _run_stem_separation_with_timeout,
    _stem_work_arrays_path,
    _store_cached_analysis,
    _store_cached_local_audio_features,
    run_analysis_job_updates,
    validate_analysis_job_request,
)
from bandscope_analysis.path_authority import resolve_local_source_path


def _local_request(
    source_path: str,
    *,
    cache_root: str | None = None,
    temp_root: str | None = None,
) -> dict[str, object]:
    """Build one otherwise-valid local-audio request for path-policy tests."""
    request: dict[str, object] = {
        "sourceKind": "local_audio",
        "projectId": "project-path-policy",
        "sourceLabel": "rehearsal.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": source_path,
            "fileName": "rehearsal.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
        },
    }
    if cache_root is not None:
        request["cacheRoot"] = cache_root
    if temp_root is not None:
        request["tempRoot"] = temp_root
    return request


def _request_with_path(field: str, value: str, tmp_path: Path) -> dict[str, object]:
    """Place an adversarial path into one request field without changing other fields."""
    source_path = str(tmp_path / "rehearsal.wav")
    request = _local_request(source_path)
    if field == "localSource.sourcePath":
        local_source = request["localSource"]
        assert isinstance(local_source, dict)
        local_source["sourcePath"] = value
    else:
        request[field] = value
    return request


def _symlink_fixed_directory(root: Path, child_name: str, outside: Path) -> None:
    """Create one fixed-directory symlink or skip when the host disallows it."""
    root.mkdir()
    outside.mkdir()
    try:
        (root / child_name).symlink_to(outside, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")


def _symlink_file(path: Path, target: Path) -> None:
    """Create one file symlink or skip when the host disallows it."""
    try:
        path.symlink_to(target)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")


def _assert_invalid_request_update(
    updates: list[dict[str, object]],
    field_name: str,
    untrusted_path: str | Path,
) -> None:
    """Assert one payload-safe actionable invalid-request job result."""
    assert len(updates) == 1
    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"] == {
        "code": "invalid_request",
        "message": f"Invalid analysis job request: invalid field '{field_name}'",
    }
    assert str(untrusted_path) not in str(updates[-1])


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("localSource.sourcePath", "relative/rehearsal.wav"),
        ("cacheRoot", "relative/cache"),
        ("tempRoot", "relative/temp"),
        ("localSource.sourcePath", r"C:..\secret.wav"),
        ("cacheRoot", r"C:..\cache"),
        ("tempRoot", r"C:..\temp"),
        ("localSource.sourcePath", r"C:\Music/../secret.wav"),
        ("cacheRoot", r"/var/cache\..\outside"),
        ("tempRoot", "/var/tmp/./bandscope"),
        ("localSource.sourcePath", r"\\server\share\rehearsal.wav"),
        ("cacheRoot", r"\\server\share\cache"),
        ("tempRoot", r"\\server\share\temp"),
        ("localSource.sourcePath", r"\\?\C:\rehearsal.wav"),
        ("cacheRoot", r"\\.\C:\cache"),
        ("tempRoot", r"\\?\C:\temp"),
    ],
)
def test_request_paths_reject_ambiguous_or_remote_authority(
    field: str, value: str, tmp_path: Path
) -> None:
    """Reject relative, mixed traversal, UNC, and device paths without echoing them."""
    request = _request_with_path(field, value, tmp_path)

    with pytest.raises(ValueError) as exc_info:
        validate_analysis_job_request(request)

    assert field in str(exc_info.value)
    assert value not in str(exc_info.value)


def test_request_paths_accept_native_absolute_roots(tmp_path: Path) -> None:
    """Preserve ordinary native absolute source, cache, and temp paths."""
    source_path = str(tmp_path / "rehearsal.wav")
    cache_root = str(tmp_path / "cache-root")
    temp_root = str(tmp_path / "temp-root")

    validated = validate_analysis_job_request(
        _local_request(source_path, cache_root=cache_root, temp_root=temp_root)
    )

    assert validated["localSource"]["sourcePath"] == source_path
    assert validated["cacheRoot"] == cache_root
    assert validated["tempRoot"] == temp_root


def test_cache_path_rechecks_fixed_subdirectory_after_validation(tmp_path: Path) -> None:
    """Reject a cache child that becomes an escaping symlink after request preflight."""
    cache_root = tmp_path / "cache-root"
    outside_root = tmp_path / "outside-cache"
    cache_root.mkdir()
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), cache_root=str(cache_root))
    )
    outside_root.mkdir()
    try:
        (cache_root / "analysis-cache-v1").symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(ValueError, match="cacheRoot"):
        _analysis_cache_path(request)


def test_temp_path_rechecks_fixed_subdirectory_after_validation(tmp_path: Path) -> None:
    """Reject a stem-work child that becomes an escaping symlink after request preflight."""
    temp_root = tmp_path / "temp-root"
    outside_root = tmp_path / "outside-temp"
    temp_root.mkdir()
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), temp_root=str(temp_root))
    )
    outside_root.mkdir()
    try:
        (temp_root / "stem-work-v1").symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(ValueError, match="tempRoot"):
        _stem_work_arrays_path(request)


@pytest.mark.parametrize("feature_index", [0, 1])
def test_feature_cache_paths_reject_preexisting_file_symlink_escape(
    tmp_path: Path,
    feature_index: int,
) -> None:
    """Reject metadata or array cache files that already symlink outside cacheRoot."""
    cache_root = tmp_path / "cache-root"
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), cache_root=str(cache_root))
    )
    feature_paths = _feature_cache_paths(request)
    assert feature_paths is not None
    escaped_path = feature_paths[feature_index]
    escaped_path.parent.mkdir(parents=True, exist_ok=True)
    outside_file = tmp_path / f"outside-feature-{feature_index}.bin"
    outside_file.write_bytes(b"outside sentinel")
    _symlink_file(escaped_path, outside_file)

    with pytest.raises(ValueError, match="cacheRoot"):
        _feature_cache_paths(request)


def test_analysis_cache_store_does_not_follow_preexisting_temp_symlink(tmp_path: Path) -> None:
    """Do not write through a pre-existing atomic-write symlink outside cacheRoot."""
    cache_root = tmp_path / "cache-root"
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), cache_root=str(cache_root))
    )
    cache_path = _analysis_cache_path(request)
    assert cache_path is not None
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    outside_file = tmp_path / "outside-analysis-cache.json"
    outside_file.write_bytes(b"outside sentinel")
    _symlink_file(cache_path.with_suffix(".tmp"), outside_file)
    song: RehearsalSong = {
        "id": "song-path-authority",
        "title": "Path Authority",
        "sections": [],
        "exportSummary": {"format": "json", "headline": "", "focusSections": []},
    }

    assert _store_cached_analysis(cache_path, request, song) is False
    assert outside_file.read_bytes() == b"outside sentinel"


@pytest.mark.parametrize("temp_kind", ["metadata", "arrays"])
def test_feature_cache_store_does_not_follow_preexisting_temp_symlink(
    tmp_path: Path,
    temp_kind: str,
) -> None:
    """Do not write feature-cache metadata or arrays through an escaping temp symlink."""
    cache_root = tmp_path / "cache-root"
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), cache_root=str(cache_root))
    )
    feature_paths = _feature_cache_paths(request)
    assert feature_paths is not None
    metadata_path, arrays_path = feature_paths
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    selected_path = metadata_path if temp_kind == "metadata" else arrays_path
    temp_path = selected_path.with_name(f"{selected_path.name}.tmp")
    outside_file = tmp_path / f"outside-{temp_kind}.bin"
    outside_file.write_bytes(b"outside sentinel")
    _symlink_file(temp_path, outside_file)
    audio_features = {
        "stems": {"vocals": np.array([0.0, 0.25], dtype=np.float32)},
        "sr": 44_100,
        "stem_role_types": {"vocals": "vocal"},
        "separation": {},
    }

    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            audio_features,
        )
        is False
    )
    assert outside_file.read_bytes() == b"outside sentinel"


def test_source_authority_rejects_direct_symlink(tmp_path: Path) -> None:
    """Reject a direct source symlink before the audio decoder receives the path."""
    real_source = tmp_path / "real.wav"
    source_link = tmp_path / "selected.wav"
    real_source.write_bytes(b"RIFF")
    try:
        source_link.symlink_to(real_source)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(ValueError, match="localSource.sourcePath"):
        resolve_local_source_path(str(source_link))


def test_source_authority_returns_existing_regular_file(tmp_path: Path) -> None:
    """Resolve an existing regular source file to its canonical absolute path."""
    source_path = tmp_path / "selected.wav"
    source_path.write_bytes(b"RIFF")

    assert resolve_local_source_path(str(source_path)) == source_path.resolve(strict=True)


def test_job_reports_direct_source_symlink_as_actionable_invalid_request(tmp_path: Path) -> None:
    """Tell callers to reselect an invalid source instead of blaming engine availability."""
    real_source = tmp_path / "real.wav"
    source_link = tmp_path / "selected.wav"
    real_source.write_bytes(b"RIFF")
    try:
        source_link.symlink_to(real_source)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    updates = run_analysis_job_updates(
        "job-path-authority",
        _local_request(str(source_link)),
        "2026-08-15T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "localSource.sourcePath", source_link)


def test_job_reports_foreign_os_absolute_source_as_invalid_request() -> None:
    """Reject a foreign-OS absolute source before progress or engine fallback is emitted."""
    windows_source = r"C:\Music\rehearsal.wav"
    foreign_source = (
        windows_source
        if not Path(windows_source).is_absolute()
        else "/var/tmp/bandscope/rehearsal.wav"
    )

    updates = run_analysis_job_updates(
        "job-foreign-path-authority",
        _local_request(foreign_source),
        "2026-08-15T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "localSource.sourcePath", foreign_source)


def test_job_translates_late_cache_authority_failure_to_invalid_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep a post-validation cache authority race actionable and payload-safe."""
    cache_root = tmp_path / "cache-root"

    def fail_cache_path(_request: object) -> None:
        raise ValueError("Invalid analysis job request: invalid field 'cacheRoot'")

    monkeypatch.setattr(api_module, "_analysis_cache_path", fail_cache_path)

    updates = run_analysis_job_updates(
        "job-cache-race",
        _local_request(str(tmp_path / "missing.wav"), cache_root=str(cache_root)),
        "2026-08-15T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "cacheRoot", cache_root)


def test_job_translates_late_feature_cache_authority_failure_to_invalid_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep a post-validation feature-cache authority race ahead of progress updates."""
    temp_root = tmp_path / "temp-root"

    def fail_feature_cache(_request: object) -> None:
        raise ValueError("Invalid analysis job request: invalid field 'tempRoot'")

    monkeypatch.setattr(api_module, "_feature_cache_paths", fail_feature_cache)

    updates = run_analysis_job_updates(
        "job-feature-cache-race",
        _local_request(str(tmp_path / "missing.wav"), temp_root=str(temp_root)),
        "2026-08-15T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "tempRoot", temp_root)


def test_job_reports_cache_symlink_escape_as_actionable_invalid_request(tmp_path: Path) -> None:
    """Reject an escaped analysis-cache directory before emitting progress updates."""
    cache_root = tmp_path / "cache-root"
    outside_root = tmp_path / "outside-cache"
    _symlink_fixed_directory(cache_root, "analysis-cache-v1", outside_root)

    updates = run_analysis_job_updates(
        "job-cache-authority",
        _local_request(str(tmp_path / "missing.wav"), cache_root=str(cache_root)),
        "2026-08-15T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "cacheRoot", cache_root)


def test_job_reports_temp_symlink_escape_as_actionable_invalid_request(tmp_path: Path) -> None:
    """Reject an escaped stem-work directory before emitting progress updates."""
    temp_root = tmp_path / "temp-root"
    outside_root = tmp_path / "outside-temp"
    _symlink_fixed_directory(temp_root, "stem-work-v1", outside_root)

    updates = run_analysis_job_updates(
        "job-temp-authority",
        _local_request(str(tmp_path / "missing.wav"), temp_root=str(temp_root)),
        "2026-08-15T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "tempRoot", temp_root)


class _FakeStemWorkQueue:
    """Return one parent-side stem-work envelope without starting a worker."""

    def __init__(self, item: tuple[str, object]) -> None:
        """Store the exact worker envelope the parent helper should consume."""
        self.item = item

    def get(self, timeout: float) -> tuple[str, object]:
        """Return the stored envelope after the parent applies a positive timeout."""
        assert timeout > 0
        return self.item

    def close(self) -> None:
        """Satisfy the parent helper close contract."""
        return None

    def join_thread(self) -> None:
        """Satisfy the parent helper join contract."""
        return None


class _FakeStemWorkProcess:
    """Stand in for the stem-work child process during sidecar authority tests."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        """Accept the parent helper process constructor without spawning a child."""
        return None

    def start(self) -> None:
        """Mark the fake process as started without spawning a child."""
        return None

    def join(self, timeout: float | None = None) -> None:
        """Satisfy the parent helper join contract."""
        del timeout

    def is_alive(self) -> bool:
        """Report that the fake process has already exited."""
        return False


class _FakeStemWorkContext:
    """Provide the multiprocessing surface used by the stem-work parent helper."""

    def __init__(self, item: tuple[str, object]) -> None:
        """Bind one worker envelope to the fake queue and process constructors."""
        self.item = item
        self.Process = _FakeStemWorkProcess

    def Queue(self, maxsize: int) -> _FakeStemWorkQueue:
        """Return a one-item queue that matches the parent helper contract."""
        assert maxsize == 1
        return _FakeStemWorkQueue(self.item)


def test_stem_work_handoff_does_not_follow_preexisting_json_symlink(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not write stem-work metadata through an escaping .json sidecar symlink."""
    temp_root = tmp_path / "temp-root"
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), temp_root=str(temp_root))
    )
    arrays_path = _stem_work_arrays_path(request)
    assert arrays_path is not None
    arrays_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(arrays_path, stem_vocals=np.array([0.0, 0.25], dtype=np.float32))
    outside_file = tmp_path / "outside-stem-work.json"
    outside_file.write_bytes(b"outside sentinel")
    _symlink_file(arrays_path.with_suffix(".json"), outside_file)
    file_payload = {
        "arraysPath": str(arrays_path),
        "sampleRate": 44_100,
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "ok"},
        "stemKeys": ["vocals"],
        "stemRoleTypes": {"vocals": "vocal"},
    }
    monkeypatch.setattr(
        api_module,
        "_multiprocessing_context",
        lambda: _FakeStemWorkContext(("ok_file", file_payload)),
    )

    with pytest.raises(ValueError, match="tempRoot"):
        _run_stem_separation_with_timeout(str(tmp_path / "rehearsal.wav"), arrays_path=arrays_path)

    assert outside_file.read_bytes() == b"outside sentinel"


def test_stem_work_handoff_rejects_worker_arrays_path_outside_temp_root(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not treat a worker-supplied arraysPath as writable tempRoot authority."""
    temp_root = tmp_path / "temp-root"
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), temp_root=str(temp_root))
    )
    arrays_path = _stem_work_arrays_path(request)
    assert arrays_path is not None
    arrays_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(arrays_path, stem_vocals=np.array([0.0, 0.25], dtype=np.float32))
    outside_dir = tmp_path / "outside-worker-root"
    outside_dir.mkdir()
    outside_arrays = outside_dir / arrays_path.name
    outside_sidecar = outside_arrays.with_suffix(".json")
    outside_sidecar.write_bytes(b"outside sentinel")
    file_payload = {
        "arraysPath": str(outside_arrays),
        "sampleRate": 44_100,
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "ok"},
        "stemKeys": ["vocals"],
        "stemRoleTypes": {"vocals": "vocal"},
    }
    monkeypatch.setattr(
        api_module,
        "_multiprocessing_context",
        lambda: _FakeStemWorkContext(("ok_file", file_payload)),
    )

    with pytest.raises(ValueError, match="tempRoot"):
        _run_stem_separation_with_timeout(str(tmp_path / "rehearsal.wav"), arrays_path=arrays_path)

    assert outside_sidecar.read_bytes() == b"outside sentinel"
    assert not arrays_path.with_suffix(".json").exists()


def test_stem_work_handoff_rejects_file_result_without_authorized_arrays_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject an ok_file envelope when the parent helper has no authorized arrays path."""
    outside_sidecar = tmp_path / "outside-unbound.json"
    outside_sidecar.write_bytes(b"outside sentinel")
    file_payload = {
        "arraysPath": str(tmp_path / "outside-unbound.npz"),
        "sampleRate": 44_100,
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "ok"},
        "stemKeys": ["vocals"],
        "stemRoleTypes": {"vocals": "vocal"},
    }
    monkeypatch.setattr(
        api_module,
        "_multiprocessing_context",
        lambda: _FakeStemWorkContext(("ok_file", file_payload)),
    )

    with pytest.raises(ValueError, match="tempRoot"):
        _run_stem_separation_with_timeout(str(tmp_path / "rehearsal.wav"))

    assert outside_sidecar.read_bytes() == b"outside sentinel"


def test_job_translates_late_stem_work_authority_failure_to_invalid_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep a post-progress stem-work authority failure actionable and payload-safe."""
    temp_root = tmp_path / "temp-root"
    source_path = tmp_path / "rehearsal.wav"
    source_path.write_bytes(b"RIFF")

    def fail_local_features(_request: object) -> None:
        raise ValueError("Invalid analysis job request: invalid field 'tempRoot'")

    monkeypatch.setattr(api_module, "_build_local_audio_features", fail_local_features)

    updates = run_analysis_job_updates(
        "job-late-stem-work-authority",
        _local_request(str(source_path), temp_root=str(temp_root)),
        "2026-08-16T00:00:00Z",
    )

    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"] == {
        "code": "invalid_request",
        "message": "Invalid analysis job request: invalid field 'tempRoot'",
    }
    assert str(temp_root) not in str(updates[-1])


def test_job_keeps_missing_source_after_progress_as_engine_unavailable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep a late missing-source failure distinct from path-authority rejection."""
    temp_root = tmp_path / "temp-root"
    source_path = tmp_path / "rehearsal.wav"
    source_path.write_bytes(b"RIFF")

    def fail_local_features(_request: object) -> None:
        raise FileNotFoundError("Audio source file not found.")

    monkeypatch.setattr(api_module, "_build_local_audio_features", fail_local_features)

    updates = run_analysis_job_updates(
        "job-late-missing-source",
        _local_request(str(source_path), temp_root=str(temp_root)),
        "2026-08-16T00:00:00Z",
    )

    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"] == {
        "code": "engine_unavailable",
        "message": "Stem separation failed",
    }
    assert str(source_path) not in str(updates[-1])


def test_job_reports_stem_work_sidecar_symlink_as_actionable_invalid_request(
    tmp_path: Path,
) -> None:
    """Reject an escaped stem-work metadata sidecar before emitting progress updates."""
    temp_root = tmp_path / "temp-root"
    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "missing.wav"), temp_root=str(temp_root))
    )
    arrays_path = _stem_work_arrays_path(request)
    assert arrays_path is not None
    arrays_path.parent.mkdir(parents=True, exist_ok=True)
    outside_file = tmp_path / "outside-job-sidecar.json"
    outside_file.write_bytes(b"outside sentinel")
    _symlink_file(arrays_path.with_suffix(".json"), outside_file)

    updates = run_analysis_job_updates(
        "job-stem-work-sidecar",
        _local_request(str(tmp_path / "missing.wav"), temp_root=str(temp_root)),
        "2026-08-16T00:00:00Z",
    )

    _assert_invalid_request_update(updates, "tempRoot", temp_root)
    assert outside_file.read_bytes() == b"outside sentinel"
