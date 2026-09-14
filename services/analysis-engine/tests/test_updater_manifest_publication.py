"""Tests for exact updater-manifest generation and publication wiring."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_BUILDER = _REPO_ROOT / "scripts" / "release" / "build_updater_manifest.py"
_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "build-baseline.yml"
_TARGETS = (
    ("windows", "amd64", "x86_64-pc-windows-msvc", ".exe"),
    ("windows", "arm64", "aarch64-pc-windows-msvc", ".exe"),
    ("macos", "amd64", "x86_64-apple-darwin", ".dmg"),
    ("macos", "arm64", "aarch64-apple-darwin", ".dmg"),
)


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _write_release_graph(
    repo_root: Path, *, source_commit: str
) -> tuple[dict[str, str], dict[str, dict[str, object]]]:
    """Write four receipt-bound updater targets and release metadata."""
    (repo_root / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    (repo_root / "bandscope-sbom.cdx.json").write_text("{}", encoding="utf-8")
    inventory = repo_root / "supply-chain" / "supplemental-component-inventory.json"
    inventory.parent.mkdir(parents=True)
    inventory.write_text("{}", encoding="utf-8")
    release = repo_root / "release"
    release.mkdir()
    (release / "updater-policy.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "state": "admitted",
                "channel": "stable",
                "minimumSupportedVersion": "1.0.0",
                "publicKey": "fixture-public-key",
                "endpoints": ["https://updates.example.test/latest.json"],
                "reason": None,
            }
        ),
        encoding="utf-8",
    )
    artifacts = repo_root / "artifacts"
    artifacts.mkdir()
    signatures: dict[str, str] = {}
    updater_identities: dict[str, dict[str, object]] = {}

    for platform, arch, target_triple, suffix in _TARGETS:
        archive_name = f"bandscope-{platform}-{arch}-{source_commit[:12]}{suffix}"
        archive_payload = f"installer-{platform}-{arch}".encode()
        (artifacts / archive_name).write_bytes(archive_payload)
        checksum_name = f"{archive_name}.sha256"
        (artifacts / checksum_name).write_text(
            f"{_digest(archive_payload)}  {archive_name}\n", encoding="utf-8"
        )
        manifest_name = f"{archive_name}.manifest.txt"
        (artifacts / manifest_name).write_text(
            (
                f"platform={platform}\narch={arch}\n"
                f"target_triple={target_triple}\narchive={archive_name}\n"
            ),
            encoding="utf-8",
        )

        if platform == "windows":
            updater_name = archive_name
            updater_payload = archive_payload
        else:
            updater_name = (
                f"bandscope-macos-{arch}-{source_commit[:12]}.app.tar.gz"
            )
            updater_payload = f"updater-{platform}-{arch}".encode()
            (artifacts / updater_name).write_bytes(updater_payload)
        signature_name = f"{updater_name}.sig"
        signature_text = f"signature-{platform}-{arch}"
        signature_payload = signature_text.encode()
        (artifacts / signature_name).write_bytes(signature_payload)
        signatures[f"{platform}-{arch}"] = signature_text
        updater_identities[f"{platform}-{arch}"] = {
            "sizeBytes": len(updater_payload),
            "sha256": _digest(updater_payload),
        }

        receipt = {
            "schemaVersion": 1,
            "version": "1.2.3",
            "tag": "v1.2.3",
            "sourceCommit": source_commit,
            "target": {
                "platform": platform,
                "arch": arch,
                "targetTriple": target_triple,
            },
            "artifacts": [
                {
                    "archive": archive_name,
                    "sizeBytes": len(archive_payload),
                    "sha256": _digest(archive_payload),
                    "checksumFile": checksum_name,
                    "manifestFile": manifest_name,
                }
            ],
            "updaterArtifacts": [
                {
                    "bundle": updater_name,
                    "sizeBytes": len(updater_payload),
                    "sha256": _digest(updater_payload),
                    "signatureFile": signature_name,
                    "signatureSizeBytes": len(signature_payload),
                    "signatureSha256": _digest(signature_payload),
                }
            ],
        }
        receipt_name = (
            f"bandscope-{platform}-{arch}-{source_commit[:12]}.release-receipt.json"
        )
        (artifacts / receipt_name).write_text(
            json.dumps(receipt), encoding="utf-8"
        )
    return signatures, updater_identities


def _run_builder(
    repo_root: Path, *, source_commit: str, check: bool = False
) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable,
        str(_BUILDER),
        "--repo-root",
        str(repo_root),
        "--git-sha",
        source_commit,
        "--repository",
        "ContextualWisdomLab/bandscope",
        "--server-url",
        "https://github.com",
        "--output",
        str(repo_root / "latest.json"),
    ]
    if check:
        command.append("--check")
    return subprocess.run(command, text=True, capture_output=True, check=False)


def test_manifest_binds_exact_receipts_and_signature_contents(tmp_path: Path) -> None:
    """Generate Tauri static JSON from exact receipt-bound updater bytes."""
    source_commit = "a" * 40
    signatures, updater_identities = _write_release_graph(
        tmp_path, source_commit=source_commit
    )

    completed = _run_builder(tmp_path, source_commit=source_commit)

    assert completed.returncode == 0, completed.stderr
    manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "1.2.3"
    assert set(manifest["platforms"]) == {
        "windows-x86_64",
        "windows-aarch64",
        "darwin-x86_64",
        "darwin-aarch64",
    }
    assert (
        manifest["platforms"]["windows-x86_64"]["signature"]
        == signatures["windows-amd64"]
    )
    assert (
        manifest["platforms"]["darwin-aarch64"]["signature"]
        == signatures["macos-arm64"]
    )
    assert manifest["platforms"]["darwin-aarch64"]["url"] == (
        "https://github.com/ContextualWisdomLab/bandscope/releases/download/v1.2.3/"
        f"bandscope-macos-arm64-{source_commit[:12]}.app.tar.gz"
    )
    assert manifest["bandscope"] == {
        "schemaVersion": 1,
        "sourceCommit": source_commit,
        "minimumSupportedVersion": "1.0.0",
        "artifacts": {
            "windows-x86_64": updater_identities["windows-amd64"],
            "windows-aarch64": updater_identities["windows-arm64"],
            "darwin-x86_64": updater_identities["macos-amd64"],
            "darwin-aarch64": updater_identities["macos-arm64"],
        },
    }


def test_manifest_check_rejects_post_generation_signature_drift(
    tmp_path: Path,
) -> None:
    """Do not publish a manifest after receipt-bound signature bytes drift."""
    source_commit = "b" * 40
    _write_release_graph(tmp_path, source_commit=source_commit)
    assert _run_builder(tmp_path, source_commit=source_commit).returncode == 0
    signature = (
        tmp_path
        / "artifacts"
        / f"bandscope-windows-amd64-{source_commit[:12]}.exe.sig"
    )
    signature.write_text("tampered-signature", encoding="utf-8")

    completed = _run_builder(tmp_path, source_commit=source_commit, check=True)

    assert completed.returncode != 0
    assert "signature" in completed.stderr.lower()


def test_manifest_rejects_ambiguous_updater_bundle_for_one_target(
    tmp_path: Path,
) -> None:
    """Static Tauri targets must resolve to one receipt-authorized updater."""
    source_commit = "c" * 40
    _write_release_graph(tmp_path, source_commit=source_commit)
    receipt_path = (
        tmp_path
        / "artifacts"
        / f"bandscope-windows-amd64-{source_commit[:12]}.release-receipt.json"
    )
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    receipt["updaterArtifacts"].append(dict(receipt["updaterArtifacts"][0]))
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")

    completed = _run_builder(tmp_path, source_commit=source_commit)

    assert completed.returncode != 0
    assert "updater" in completed.stderr.lower()


def test_release_workflow_builds_and_rechecks_manifest_before_publication() -> None:
    """Immutable release publication must include the exact generated latest.json."""
    workflow = _WORKFLOW.read_text(encoding="utf-8")
    build_command = "python3 scripts/release/build_updater_manifest.py"
    publish_command = 'gh release create "$RELEASE_TAG"'
    assert build_command in workflow
    assert "--check" in workflow
    assert "latest.json" in workflow
    assert workflow.index(build_command) < workflow.index(publish_command)


def test_builder_rejects_non_https_release_host(tmp_path: Path) -> None:
    """Updater bundle URLs must not downgrade release transport."""
    source_commit = "d" * 40
    _write_release_graph(tmp_path, source_commit=source_commit)
    command = [
        sys.executable,
        str(_BUILDER),
        "--repo-root",
        str(tmp_path),
        "--git-sha",
        source_commit,
        "--repository",
        "ContextualWisdomLab/bandscope",
        "--server-url",
        "http://github.com",
        "--output",
        str(tmp_path / "latest.json"),
    ]

    completed = subprocess.run(command, text=True, capture_output=True, check=False)

    assert completed.returncode != 0
    assert "https" in completed.stderr.lower()
