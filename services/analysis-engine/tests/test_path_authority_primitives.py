"""Focused tests for filesystem path-authority primitives."""

from __future__ import annotations

from pathlib import Path

import pytest

from bandscope_analysis.path_authority import (
    resolve_authorized_child_path,
    resolve_local_source_path,
    validate_local_path_shape,
)


@pytest.mark.parametrize(
    "value",
    [
        "/var/tmp/bandscope/rehearsal.wav",
        r"C:\Music\rehearsal.wav",
    ],
)
def test_validate_local_path_shape_accepts_fully_qualified_local_syntax(value: str) -> None:
    """Accept fully-qualified local syntax independently of the CI host OS."""
    validate_local_path_shape(value, "localSource.sourcePath")


@pytest.mark.parametrize(
    "value",
    [
        "",
        "   ",
        "relative/rehearsal.wav",
        "./rehearsal.wav",
        "../rehearsal.wav",
        "/tmp/../rehearsal.wav",
        r"C:rehearsal.wav",
        r"C:..\rehearsal.wav",
        r"\Music\rehearsal.wav",
        r"\\server\share\rehearsal.wav",
        "//server/share/rehearsal.wav",
        r"\\?\C:\rehearsal.wav",
        r"\\.\C:\rehearsal.wav",
        "//?/C:/rehearsal.wav",
        "//./C:/rehearsal.wav",
        "/tmp/rehearsal\x00.wav",
    ],
)
def test_validate_local_path_shape_rejects_ambiguous_or_nonlocal_syntax(value: str) -> None:
    """Reject path shapes that depend on ambient, network, or device authority."""
    with pytest.raises(ValueError) as exc_info:
        validate_local_path_shape(value, "localSource.sourcePath")

    assert "localSource.sourcePath" in str(exc_info.value)
    if value:
        assert value not in str(exc_info.value)


def test_resolve_local_source_path_returns_canonical_regular_file(tmp_path: Path) -> None:
    """Return the canonical path for an existing regular local source."""
    source = tmp_path / "rehearsal.wav"
    source.write_bytes(b"RIFF")

    assert resolve_local_source_path(str(source)) == source.resolve(strict=True)


def test_resolve_local_source_path_returns_canonical_missing_path(tmp_path: Path) -> None:
    """Leave the payload-safe missing-file result to the separation worker."""
    missing = tmp_path / "missing.wav"

    assert resolve_local_source_path(str(missing)) == missing.resolve(strict=False)


def test_resolve_local_source_path_rejects_directory(tmp_path: Path) -> None:
    """Reject an existing directory where a regular audio file is required."""
    directory = tmp_path / "audio-directory"
    directory.mkdir()

    with pytest.raises(ValueError, match="localSource.sourcePath"):
        resolve_local_source_path(str(directory))


def test_resolve_local_source_path_rejects_direct_symlink(tmp_path: Path) -> None:
    """Reject a directly selected symlink before canonical resolution follows it."""
    target = tmp_path / "target.wav"
    link = tmp_path / "selected.wav"
    target.write_bytes(b"RIFF")
    try:
        link.symlink_to(target)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(ValueError, match="localSource.sourcePath"):
        resolve_local_source_path(str(link))


def test_resolve_local_source_path_rejects_non_native_runtime_shape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Require the actual I/O host to recognize the lexically valid absolute path."""
    source = tmp_path / "rehearsal.wav"
    monkeypatch.setattr(Path, "is_absolute", lambda _path: False)

    with pytest.raises(ValueError, match="localSource.sourcePath"):
        resolve_local_source_path(str(source))


def test_resolve_local_source_path_rejects_resolution_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Convert native canonicalization failures into payload-safe validation errors."""
    source = tmp_path / "rehearsal.wav"

    def fail_resolution(_path: Path, *, strict: bool = False) -> Path:
        del strict
        raise OSError("simulated resolution failure")

    monkeypatch.setattr(Path, "resolve", fail_resolution)

    with pytest.raises(ValueError, match="localSource.sourcePath"):
        resolve_local_source_path(str(source))


def test_resolve_authorized_child_path_returns_contained_digest_child(tmp_path: Path) -> None:
    """Resolve a repository-owned child beneath a canonical local root."""
    root = tmp_path / "cache-root"
    expected = root / "analysis-cache-v1" / "digest.json"

    resolved = resolve_authorized_child_path(
        str(root),
        "cacheRoot",
        "analysis-cache-v1",
        "digest.json",
    )

    assert resolved == expected.resolve(strict=False)
    assert resolved.is_relative_to(root.resolve(strict=False))


def test_resolve_authorized_child_path_rejects_direct_root_symlink(tmp_path: Path) -> None:
    """Reject a root whose authority is itself supplied through a symlink."""
    target = tmp_path / "real-cache"
    link = tmp_path / "cache-link"
    target.mkdir()
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(ValueError, match="cacheRoot"):
        resolve_authorized_child_path(str(link), "cacheRoot", "analysis-cache-v1", "digest.json")


def test_resolve_authorized_child_path_rejects_non_native_runtime_root(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject a root that the actual I/O host does not recognize as absolute."""
    root = tmp_path / "cache-root"
    monkeypatch.setattr(Path, "is_absolute", lambda _path: False)

    with pytest.raises(ValueError, match="cacheRoot"):
        resolve_authorized_child_path(
            str(root),
            "cacheRoot",
            "analysis-cache-v1",
            "digest.json",
        )


def test_resolve_authorized_child_path_rejects_resolution_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Convert root canonicalization failures into payload-safe validation errors."""
    root = tmp_path / "cache-root"

    def fail_resolution(_path: Path, *, strict: bool = False) -> Path:
        del strict
        raise OSError("simulated resolution failure")

    monkeypatch.setattr(Path, "resolve", fail_resolution)

    with pytest.raises(ValueError, match="cacheRoot"):
        resolve_authorized_child_path(
            str(root),
            "cacheRoot",
            "analysis-cache-v1",
            "digest.json",
        )


def test_resolve_authorized_child_path_rejects_existing_child_symlink_escape(
    tmp_path: Path,
) -> None:
    """Reject a fixed cache directory that already redirects outside its authorized root."""
    root = tmp_path / "cache-root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    try:
        (root / "analysis-cache-v1").symlink_to(outside, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(ValueError, match="cacheRoot"):
        resolve_authorized_child_path(str(root), "cacheRoot", "analysis-cache-v1", "digest.json")
