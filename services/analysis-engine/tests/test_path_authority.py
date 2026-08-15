"""Security regressions for analysis filesystem path authority."""

from __future__ import annotations

from pathlib import Path

import pytest

from bandscope_analysis.api import (
    _analysis_cache_path,
    _stem_work_arrays_path,
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


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("localSource.sourcePath", "relative/rehearsal.wav"),
        ("cacheRoot", "relative/cache"),
        ("tempRoot", "relative/temp"),
        ("localSource.sourcePath", r"C:..\secret.wav"),
        ("cacheRoot", r"C:..\cache"),
        ("tempRoot", r"C:..\temp"),
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
    """Reject relative, drive-relative, UNC, and device paths without echoing them."""
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


def test_cache_path_rejects_symlinked_fixed_subdirectory(tmp_path: Path) -> None:
    """Do not let the fixed cache subdirectory escape an authorized root through a symlink."""
    cache_root = tmp_path / "cache-root"
    outside_root = tmp_path / "outside-cache"
    cache_root.mkdir()
    outside_root.mkdir()
    try:
        (cache_root / "analysis-cache-v1").symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), cache_root=str(cache_root))
    )

    with pytest.raises(ValueError, match="cacheRoot"):
        _analysis_cache_path(request)


def test_temp_path_rejects_symlinked_fixed_subdirectory(tmp_path: Path) -> None:
    """Do not let the fixed stem-work subdirectory escape an authorized temp root through a symlink."""
    temp_root = tmp_path / "temp-root"
    outside_root = tmp_path / "outside-temp"
    temp_root.mkdir()
    outside_root.mkdir()
    try:
        (temp_root / "stem-work-v1").symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    request = validate_analysis_job_request(
        _local_request(str(tmp_path / "rehearsal.wav"), temp_root=str(temp_root))
    )

    with pytest.raises(ValueError, match="tempRoot"):
        _stem_work_arrays_path(request)


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
