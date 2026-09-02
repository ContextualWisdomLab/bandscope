"""Platform signature and notarization gates for BandScope release artifacts."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_platform_trust.py"
_BUILD_BASELINE_PATH = _REPOSITORY_ROOT / ".github" / "workflows" / "build-baseline.yml"


def _load_guard() -> ModuleType:
    """Load the executable release-trust guard from its repository path."""
    assert _GUARD_PATH.is_file(), "release builds must own a platform trust verifier"
    guard_spec = importlib.util.spec_from_file_location(
        "verify_release_platform_trust", _GUARD_PATH
    )
    assert guard_spec is not None and guard_spec.loader is not None
    guard_module = importlib.util.module_from_spec(guard_spec)
    guard_spec.loader.exec_module(guard_module)
    return guard_module


def _command_result(
    returncode: int = 0, stdout: str = "", stderr: str = ""
) -> SimpleNamespace:
    """Build the subprocess result shape consumed by the trust verifier."""
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


def _workflow_job_block(workflow_text: str, job_name: str) -> str:
    """Return one top-level GitHub Actions job without adding a YAML dependency."""
    job_marker = f"  {job_name}:"
    workflow_lines = workflow_text.splitlines()
    job_start_index = workflow_lines.index(job_marker)
    job_end_index = len(workflow_lines)
    for line_index in range(job_start_index + 1, len(workflow_lines)):
        workflow_line = workflow_lines[line_index]
        if (
            workflow_line.startswith("  ")
            and not workflow_line.startswith("    ")
            and workflow_line.endswith(":")
        ):
            job_end_index = line_index
            break
    return "\n".join(workflow_lines[job_start_index:job_end_index])


def test_windows_release_trust_requires_valid_exact_publisher(tmp_path: Path) -> None:
    """Accept only valid Authenticode signatures from the configured publisher."""
    guard = _load_guard()
    artifact_path = tmp_path / "bandscope.exe"
    artifact_path.write_bytes(b"signed-installer-placeholder")
    commands: list[list[str]] = []

    def valid_runner(command: list[str], **_: object) -> SimpleNamespace:
        commands.append(command)
        return _command_result(
            stdout='{"Status":"Valid","Subject":"CN=ContextualWisdomLab"}'
        )

    verified = guard.verify_windows_artifacts(
        tmp_path, "CN=ContextualWisdomLab", runner=valid_runner
    )

    assert verified == [artifact_path]
    assert commands[0][0] == "pwsh"
    assert str(artifact_path) == commands[0][-1]

    def unsigned_runner(command: list[str], **_: object) -> SimpleNamespace:
        del command
        return _command_result(stdout='{"Status":"NotSigned","Subject":null}')

    with pytest.raises(ValueError, match="valid Authenticode signature"):
        guard.verify_windows_artifacts(
            tmp_path, "CN=ContextualWisdomLab", runner=unsigned_runner
        )

    def wrong_publisher_runner(command: list[str], **_: object) -> SimpleNamespace:
        del command
        return _command_result(stdout='{"Status":"Valid","Subject":"CN=Other Publisher"}')

    with pytest.raises(ValueError, match="approved Windows publisher"):
        guard.verify_windows_artifacts(
            tmp_path, "CN=ContextualWisdomLab", runner=wrong_publisher_runner
        )


def test_windows_release_trust_fails_closed_without_identity_or_artifacts(
    tmp_path: Path,
) -> None:
    """Refuse a tag release when publisher authority or installers are absent."""
    guard = _load_guard()

    with pytest.raises(ValueError, match="Windows publisher subject"):
        guard.verify_windows_artifacts(tmp_path, "")

    with pytest.raises(ValueError, match="Windows release installer"):
        guard.verify_windows_artifacts(tmp_path, "CN=ContextualWisdomLab")


def test_macos_release_trust_requires_team_signature_and_stapled_ticket(
    tmp_path: Path,
) -> None:
    """Require Developer ID team identity plus offline notarization evidence."""
    guard = _load_guard()
    artifact_root = tmp_path / "artifacts"
    bundle_root = tmp_path / "bundle" / "macos"
    artifact_root.mkdir()
    app_path = bundle_root / "BandScope.app"
    app_path.mkdir(parents=True)
    dmg_path = artifact_root / "bandscope.dmg"
    dmg_path.write_bytes(b"notarized-dmg-placeholder")
    commands: list[list[str]] = []

    def valid_runner(command: list[str], **_: object) -> SimpleNamespace:
        commands.append(command)
        if command[:3] == ["codesign", "--display", "--verbose=4"]:
            return _command_result(stderr="TeamIdentifier=ABCDE12345\n")
        return _command_result()

    verified_apps, verified_dmgs = guard.verify_macos_artifacts(
        artifact_root, bundle_root, "ABCDE12345", runner=valid_runner
    )

    assert verified_apps == [app_path]
    assert verified_dmgs == [dmg_path]
    assert ["codesign", "--verify", "--deep", "--strict", str(app_path)] in commands
    assert ["xcrun", "stapler", "validate", str(dmg_path)] in commands
    assert [
        "spctl",
        "--assess",
        "--type",
        "open",
        "--context",
        "context:primary-signature",
        "--verbose=2",
        str(dmg_path),
    ] in commands


def test_macos_release_trust_fails_closed_on_wrong_team_or_notarization(
    tmp_path: Path,
) -> None:
    """Reject an unexpected signing team and a DMG without valid notarization evidence."""
    guard = _load_guard()
    artifact_root = tmp_path / "artifacts"
    bundle_root = tmp_path / "bundle" / "macos"
    artifact_root.mkdir()
    app_path = bundle_root / "BandScope.app"
    app_path.mkdir(parents=True)
    dmg_path = artifact_root / "bandscope.dmg"
    dmg_path.write_bytes(b"dmg-placeholder")

    def wrong_team_runner(command: list[str], **_: object) -> SimpleNamespace:
        if command[:3] == ["codesign", "--display", "--verbose=4"]:
            return _command_result(stderr="TeamIdentifier=ZZZZZ99999\n")
        return _command_result()

    with pytest.raises(ValueError, match="approved Apple Team ID"):
        guard.verify_macos_artifacts(
            artifact_root, bundle_root, "ABCDE12345", runner=wrong_team_runner
        )

    def unstapled_runner(command: list[str], **_: object) -> SimpleNamespace:
        if command[:3] == ["codesign", "--display", "--verbose=4"]:
            return _command_result(stderr="TeamIdentifier=ABCDE12345\n")
        if command[:3] == ["xcrun", "stapler", "validate"]:
            return _command_result(returncode=1, stderr="ticket missing")
        return _command_result()

    with pytest.raises(ValueError, match="notarization ticket"):
        guard.verify_macos_artifacts(
            artifact_root, bundle_root, "ABCDE12345", runner=unstapled_runner
        )


def test_macos_release_trust_fails_closed_without_identity_or_outputs(
    tmp_path: Path,
) -> None:
    """Refuse a macOS release when configured team authority or outputs are absent."""
    guard = _load_guard()
    artifact_root = tmp_path / "artifacts"
    bundle_root = tmp_path / "bundle"
    artifact_root.mkdir()
    bundle_root.mkdir()

    with pytest.raises(ValueError, match="Apple Team ID"):
        guard.verify_macos_artifacts(artifact_root, bundle_root, "")

    with pytest.raises(ValueError, match="macOS application bundle"):
        guard.verify_macos_artifacts(artifact_root, bundle_root, "ABCDE12345")


def test_tag_builds_verify_platform_trust_before_upload() -> None:
    """Keep immutable publication downstream of platform-native trust verification."""
    workflow_text = _BUILD_BASELINE_PATH.read_text(encoding="utf-8")

    for job_name in ("build-windows-native", "build-windows-arm64"):
        job_block = _workflow_job_block(workflow_text, job_name)
        verification_index = job_block.index(
            "python scripts/checks/verify_release_platform_trust.py windows"
        )
        upload_index = job_block.index("uses: actions/upload-artifact@")
        assert "if: startsWith(github.ref, 'refs/tags/v')" in job_block
        assert "BANDSCOPE_WINDOWS_PUBLISHER_SUBJECT" in job_block
        assert verification_index < upload_index

    for job_name in ("build-macos-native", "build-macos-arm64"):
        job_block = _workflow_job_block(workflow_text, job_name)
        verification_index = job_block.index(
            "python3 scripts/checks/verify_release_platform_trust.py macos"
        )
        upload_index = job_block.index("uses: actions/upload-artifact@")
        assert "if: startsWith(github.ref, 'refs/tags/v')" in job_block
        assert "BANDSCOPE_APPLE_TEAM_ID" in job_block
        assert verification_index < upload_index
