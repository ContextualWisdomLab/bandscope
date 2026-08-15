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
