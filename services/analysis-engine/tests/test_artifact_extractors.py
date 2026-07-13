"""Tests for repository-owned GitHub artifact ZIP extractors."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest
from conftest import load_module, make_symlink_or_skip


def _write_zip(path: Path, members: dict[str, bytes]) -> None:
    """Write a ZIP archive with explicit member names and byte payloads."""
    with zipfile.ZipFile(path, "w") as archive:
        for member_name, payload in members.items():
            archive.writestr(member_name, payload)


def test_scorecard_artifact_extractor_writes_expected_sarif(tmp_path: Path) -> None:
    """Extract the single expected Scorecard SARIF member."""
    extractor = load_module(
        "scripts/checks/extract_scorecard_artifact.py",
        "extract_scorecard_artifact_valid",
    )
    archive_path = tmp_path / "scorecard.zip"
    _write_zip(archive_path, {"results.sarif": b'{"version":"2.1.0"}'})

    extracted = extractor.extract_scorecard_artifact(archive_path, tmp_path / "out")

    assert extracted.name == "results.sarif"
    assert extracted.read_bytes() == b'{"version":"2.1.0"}'


def test_scorecard_artifact_extractor_rejects_backslash_traversal_member(
    tmp_path: Path,
) -> None:
    """Reject Windows-style traversal names before any artifact is written."""
    extractor = load_module(
        "scripts/checks/extract_scorecard_artifact.py",
        "extract_scorecard_artifact_backslash_traversal",
    )
    archive_path = tmp_path / "scorecard.zip"
    output_dir = tmp_path / "out"
    _write_zip(archive_path, {"..\\results.sarif": b"{}"})

    with pytest.raises(ValueError, match="unexpected artifact member"):
        extractor.extract_scorecard_artifact(archive_path, output_dir)

    assert not output_dir.exists()


def test_scorecard_artifact_extractor_rejects_symlink_output_path(
    tmp_path: Path,
) -> None:
    """Reject extraction into an existing symlinked output directory."""
    extractor = load_module(
        "scripts/checks/extract_scorecard_artifact.py",
        "extract_scorecard_artifact_symlink_output",
    )
    archive_path = tmp_path / "scorecard.zip"
    real_output = tmp_path / "real-output"
    symlink_output = tmp_path / "linked-output"
    real_output.mkdir()
    make_symlink_or_skip(symlink_output, real_output, target_is_directory=True)
    _write_zip(archive_path, {"results.sarif": b"{}"})

    with pytest.raises(ValueError, match="symlinked output path is not allowed"):
        extractor.extract_scorecard_artifact(archive_path, symlink_output)


def test_release_artifact_extractor_writes_allowlisted_release_files(
    tmp_path: Path,
) -> None:
    """Extract allowlisted release artifacts with matching sidecar names."""
    extractor = load_module(
        "scripts/release/extract_release_artifacts.py",
        "extract_release_artifacts_valid",
    )
    archive_path = tmp_path / "release.zip"
    _write_zip(
        archive_path,
        {
            "bandscope-windows-amd64-abc123def456.exe": b"exe",
            "bandscope-windows-amd64-abc123def456.exe.sha256": b"sha",
            "bandscope-macos-arm64-abc123def456.dmg.manifest.txt": b"manifest",
        },
    )

    extracted = extractor.extract_release_artifacts(archive_path, tmp_path / "out")

    assert [path.name for path in extracted] == [
        "bandscope-macos-arm64-abc123def456.dmg.manifest.txt",
        "bandscope-windows-amd64-abc123def456.exe",
        "bandscope-windows-amd64-abc123def456.exe.sha256",
    ]


def test_release_artifact_extractor_rejects_backslash_traversal_member(
    tmp_path: Path,
) -> None:
    """Reject Windows-style traversal names in downloaded release artifacts."""
    extractor = load_module(
        "scripts/release/extract_release_artifacts.py",
        "extract_release_artifacts_backslash_traversal",
    )
    archive_path = tmp_path / "release.zip"
    output_dir = tmp_path / "out"
    _write_zip(archive_path, {"..\\bandscope-windows-amd64-abc123def456.exe": b"exe"})

    with pytest.raises(ValueError, match="unexpected release artifact member"):
        extractor.extract_release_artifacts(archive_path, output_dir)

    assert list(output_dir.iterdir()) == []


def test_release_artifact_extractor_rejects_symlink_output_path(
    tmp_path: Path,
) -> None:
    """Reject release extraction into an existing symlinked output directory."""
    extractor = load_module(
        "scripts/release/extract_release_artifacts.py",
        "extract_release_artifacts_symlink_output",
    )
    archive_path = tmp_path / "release.zip"
    real_output = tmp_path / "real-output"
    symlink_output = tmp_path / "linked-output"
    real_output.mkdir()
    make_symlink_or_skip(symlink_output, real_output, target_is_directory=True)
    _write_zip(archive_path, {"bandscope-windows-amd64-abc123def456.exe": b"exe"})

    with pytest.raises(ValueError, match="symlinked output path is not allowed"):
        extractor.extract_release_artifacts(archive_path, symlink_output)
