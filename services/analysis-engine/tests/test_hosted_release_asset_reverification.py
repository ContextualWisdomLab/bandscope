"""Tests for immutable release upload/download byte re-verification."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERIFIER = _REPO_ROOT / "scripts" / "release" / "verify_hosted_release_assets.py"
_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "build-baseline.yml"


def _run_verifier(
    local_root: Path,
    hosted_root: Path,
    asset_list: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(_VERIFIER),
            "--local-root",
            str(local_root),
            "--hosted-root",
            str(hosted_root),
            "--asset-list",
            str(asset_list),
        ],
        text=True,
        capture_output=True,
        check=False,
    )


def _fixture(tmp_path: Path) -> tuple[Path, Path, Path]:
    local_root = tmp_path / "local"
    hosted_root = tmp_path / "hosted"
    local_root.mkdir()
    hosted_root.mkdir()
    names = [
        "latest.json",
        "bandscope-windows-amd64.exe",
        "bandscope-windows-amd64.exe.sig",
    ]
    for name in names:
        payload = f"payload:{name}\n".encode()
        (local_root / name).write_bytes(payload)
        (hosted_root / name).write_bytes(payload)
    asset_list = tmp_path / "release-assets.txt"
    asset_list.write_text("\n".join(names) + "\n", encoding="utf-8")
    return local_root, hosted_root, asset_list


def test_hosted_verifier_accepts_exact_uploaded_asset_bytes(tmp_path: Path) -> None:
    """Every hosted release asset must match admitted local bytes."""
    local_root, hosted_root, asset_list = _fixture(tmp_path)

    completed = _run_verifier(local_root, hosted_root, asset_list)

    assert completed.returncode == 0, completed.stderr


def test_hosted_verifier_rejects_signature_drift(tmp_path: Path) -> None:
    """A remotely different signature invalidates publication evidence."""
    local_root, hosted_root, asset_list = _fixture(tmp_path)
    (hosted_root / "bandscope-windows-amd64.exe.sig").write_text(
        "different-signature\n", encoding="utf-8"
    )

    completed = _run_verifier(local_root, hosted_root, asset_list)

    assert completed.returncode != 0
    assert "digest" in completed.stderr.lower()


def test_hosted_verifier_rejects_missing_or_unexpected_assets(
    tmp_path: Path,
) -> None:
    """Publication cannot drop admitted assets or add unreviewed assets."""
    local_root, hosted_root, asset_list = _fixture(tmp_path)
    (hosted_root / "latest.json").unlink()
    (hosted_root / "unexpected.bin").write_bytes(b"unexpected")

    completed = _run_verifier(local_root, hosted_root, asset_list)

    assert completed.returncode != 0
    assert "asset set" in completed.stderr.lower()


def test_hosted_verifier_rejects_duplicate_or_nested_asset_list_members(
    tmp_path: Path,
) -> None:
    """Expected publication names must be unique safe basenames."""
    local_root, hosted_root, asset_list = _fixture(tmp_path)
    asset_list.write_text(
        "latest.json\nlatest.json\n../escape.bin\n",
        encoding="utf-8",
    )

    completed = _run_verifier(local_root, hosted_root, asset_list)

    assert completed.returncode != 0
    assert "asset list" in completed.stderr.lower()


def test_release_workflow_reverifies_draft_and_published_assets() -> None:
    """Publication compares downloaded draft/final bytes to local authority."""
    workflow = _WORKFLOW.read_text(encoding="utf-8")
    verifier = "python3 scripts/release/verify_hosted_release_assets.py"
    assert workflow.count("gh release download") >= 2
    assert workflow.count(verifier) >= 2
    assert workflow.index("gh release create") < workflow.index(verifier)
    assert workflow.index(verifier) < workflow.index("gh release edit")
    assert workflow.rindex("gh release edit") < workflow.rindex(verifier)
