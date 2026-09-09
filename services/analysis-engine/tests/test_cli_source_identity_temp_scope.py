"""Regression coverage for source-bound temporary stem-work paths."""

from __future__ import annotations

from pathlib import Path

import pytest

from bandscope_analysis import cli
from bandscope_analysis.cli import (
    _bind_verified_source_cache_namespace,
    _cleanup_job_temp_namespace,
)


def test_verified_digest_scopes_temp_work_to_exact_source_identity() -> None:
    """Prevent same-metadata replacement audio from sharing one stem-work path."""
    source_digest = "ab" * 32
    request = {
        "sourceKind": "local_audio",
        "cacheRoot": "/tmp/cache",
        "tempRoot": "/tmp/work",
    }

    bound = _bind_verified_source_cache_namespace(request, source_digest)

    assert isinstance(bound, dict)
    assert Path(str(bound["cacheRoot"])).parts[-2:] == (
        "source-sha256-v1",
        source_digest,
    )
    assert Path(str(bound["tempRoot"])).parts[-2:] == (
        "source-sha256-v1",
        source_digest,
    )


def test_same_source_concurrent_jobs_use_distinct_temp_work_namespaces() -> None:
    """Keep the two admitted concurrent jobs from sharing one stem-work artifact path."""
    source_digest = "ab" * 32
    request = {
        "sourceKind": "local_audio",
        "cacheRoot": "/tmp/cache",
        "tempRoot": "/tmp/work",
    }

    first = _bind_verified_source_cache_namespace(request, source_digest, "job-1")
    second = _bind_verified_source_cache_namespace(request, source_digest, "job-2")

    assert isinstance(first, dict)
    assert isinstance(second, dict)
    assert first["cacheRoot"] == second["cacheRoot"]
    assert first["tempRoot"] != second["tempRoot"]
    assert Path(str(first["tempRoot"])).parts[-4:-2] == (
        "source-sha256-v1",
        source_digest,
    )
    assert Path(str(first["tempRoot"])).parts[-2] == "job-sha256-v1"
    assert len(Path(str(first["tempRoot"])).parts[-1]) == 64


def test_unverified_job_disables_cache_but_still_isolates_temp_work() -> None:
    """Keep manual local jobs isolated even when persisted cache reuse is disabled."""
    bound = _bind_verified_source_cache_namespace(
        {
            "sourceKind": "local_audio",
            "cacheRoot": "/tmp/cache",
            "tempRoot": "/tmp/work",
        },
        None,
        "manual-job",
    )

    assert isinstance(bound, dict)
    assert "cacheRoot" not in bound
    assert Path(str(bound["tempRoot"])).parts[-2] == "job-sha256-v1"
    assert len(Path(str(bound["tempRoot"])).parts[-1]) == 64


def test_job_temp_cleanup_removes_only_the_derived_execution_namespace(tmp_path: Path) -> None:
    """Remove completed stem work without deleting the reusable source namespace."""
    source_digest = "ab" * 32
    bound = _bind_verified_source_cache_namespace(
        {
            "sourceKind": "local_audio",
            "cacheRoot": str(tmp_path / "cache"),
            "tempRoot": str(tmp_path / "work"),
        },
        source_digest,
        "job-cleanup",
    )
    assert isinstance(bound, dict)
    job_root = Path(str(bound["tempRoot"]))
    source_root = job_root.parents[1]
    stem_path = job_root / "stem-work-v1" / "stems.npz"
    stem_path.parent.mkdir(parents=True)
    stem_path.write_bytes(b"temporary-stems")
    sibling = source_root / "keep.txt"
    sibling.write_text("keep", encoding="utf-8")

    _cleanup_job_temp_namespace(bound)

    assert not job_root.exists()
    assert sibling.read_text(encoding="utf-8") == "keep"


def test_unverified_job_temp_cleanup_removes_only_its_job_namespace(tmp_path: Path) -> None:
    """Clean manual-job stem work without requiring persisted source identity."""
    bound = _bind_verified_source_cache_namespace(
        {
            "sourceKind": "local_audio",
            "tempRoot": str(tmp_path / "work"),
        },
        None,
        "manual-cleanup",
    )
    assert isinstance(bound, dict)
    job_root = Path(str(bound["tempRoot"]))
    stem_path = job_root / "stem-work-v1" / "stems.npz"
    stem_path.parent.mkdir(parents=True)
    stem_path.write_bytes(b"temporary-stems")

    _cleanup_job_temp_namespace(bound)

    assert not job_root.exists()


def test_job_temp_cleanup_refuses_symlinked_source_namespace(tmp_path: Path) -> None:
    """Do not follow a substituted derived parent outside app-owned stem work."""
    source_digest = "ab" * 32
    job_digest = "cd" * 32
    outside_root = tmp_path / "outside"
    outside_job = outside_root / "job-sha256-v1" / job_digest
    outside_job.mkdir(parents=True)
    sentinel = outside_job / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")

    source_scope = tmp_path / "work" / "source-sha256-v1"
    source_scope.mkdir(parents=True)
    source_link = source_scope / source_digest
    try:
        source_link.symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"directory symlink unavailable: {error}")

    _cleanup_job_temp_namespace(
        {"tempRoot": str(source_link / "job-sha256-v1" / job_digest)}
    )

    assert sentinel.read_text(encoding="utf-8") == "keep"


def test_job_temp_cleanup_refuses_symlinked_temp_root(tmp_path: Path) -> None:
    """A caller-selected temp root symlink cannot redirect recursive cleanup."""
    job_digest = "cd" * 32
    outside_root = tmp_path / "outside"
    outside_job = outside_root / "job-sha256-v1" / job_digest
    outside_job.mkdir(parents=True)
    sentinel = outside_job / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")
    temp_root = tmp_path / "work-link"
    try:
        temp_root.symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"directory symlink unavailable: {error}")

    _cleanup_job_temp_namespace(
        {"tempRoot": str(temp_root / "job-sha256-v1" / job_digest)}
    )

    assert sentinel.read_text(encoding="utf-8") == "keep"


def test_job_temp_cleanup_refuses_verified_symlinked_temp_root(tmp_path: Path) -> None:
    """Verified-source scoping cannot make a symlinked caller temp root deletable."""
    source_digest = "ab" * 32
    job_digest = "cd" * 32
    outside_root = tmp_path / "outside"
    outside_job = (
        outside_root
        / "source-sha256-v1"
        / source_digest
        / "job-sha256-v1"
        / job_digest
    )
    outside_job.mkdir(parents=True)
    sentinel = outside_job / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")
    temp_root = tmp_path / "work-link"
    try:
        temp_root.symlink_to(outside_root, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"directory symlink unavailable: {error}")

    _cleanup_job_temp_namespace(
        {
            "tempRoot": str(
                temp_root
                / "source-sha256-v1"
                / source_digest
                / "job-sha256-v1"
                / job_digest
            )
        }
    )

    assert sentinel.read_text(encoding="utf-8") == "keep"


def test_job_temp_cleanup_refuses_unsafe_rmtree_runtime(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Leave work for later cleanup when recursive deletion lacks symlink resistance."""
    bound = _bind_verified_source_cache_namespace(
        {
            "sourceKind": "local_audio",
            "tempRoot": str(tmp_path / "work"),
        },
        "ab" * 32,
        "unsafe-runtime",
    )
    assert isinstance(bound, dict)
    job_root = Path(str(bound["tempRoot"]))
    sentinel = job_root / "keep.txt"
    sentinel.parent.mkdir(parents=True)
    sentinel.write_text("keep", encoding="utf-8")
    monkeypatch.setattr(cli.shutil.rmtree, "avoids_symlink_attacks", False)

    _cleanup_job_temp_namespace(bound)

    assert sentinel.read_text(encoding="utf-8") == "keep"


def test_job_temp_cleanup_refuses_unscoped_or_malformed_roots(tmp_path: Path) -> None:
    """Do not grant recursive deletion authority outside a derived job namespace."""
    unsafe_root = tmp_path / "caller-root"
    unsafe_root.mkdir()
    sentinel = unsafe_root / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")
    malformed = tmp_path / "job-sha256-v1" / "not-a-digest"
    malformed.mkdir(parents=True)
    malformed_sentinel = malformed / "keep.txt"
    malformed_sentinel.write_text("keep", encoding="utf-8")
    malformed_source = (
        tmp_path
        / "source-sha256-v1"
        / "not-a-source-digest"
        / "job-sha256-v1"
        / ("ef" * 32)
    )
    malformed_source.mkdir(parents=True)
    malformed_source_sentinel = malformed_source / "keep.txt"
    malformed_source_sentinel.write_text("keep", encoding="utf-8")

    _cleanup_job_temp_namespace(None)
    _cleanup_job_temp_namespace({})
    _cleanup_job_temp_namespace({"tempRoot": "relative"})
    _cleanup_job_temp_namespace({"tempRoot": f"job-sha256-v1/{'ef' * 32}"})
    _cleanup_job_temp_namespace({"tempRoot": str(unsafe_root)})
    _cleanup_job_temp_namespace({"tempRoot": str(malformed)})
    _cleanup_job_temp_namespace({"tempRoot": str(malformed_source)})

    assert sentinel.read_text(encoding="utf-8") == "keep"
    assert malformed_sentinel.read_text(encoding="utf-8") == "keep"
    assert malformed_source_sentinel.read_text(encoding="utf-8") == "keep"
