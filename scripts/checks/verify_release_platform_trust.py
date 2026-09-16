#!/usr/bin/env python3
"""Verify platform-native trust on BandScope release artifacts before publication.

Security Notes:
    This verifier has read/execute authority only over repository-built release outputs and
    fixed platform trust tools. Artifact paths are passed as subprocess arguments rather than
    interpolated into shell text. Publisher identity comes from repository configuration, is
    bounded, and is compared exactly. Command output is parsed only for the minimum signature
    status/team fields and is never promoted into a filesystem path or command. Any missing
    artifact, missing identity, malformed trust output, unsigned artifact, unexpected signer,
    failed Gatekeeper assessment, or missing notarization ticket fails closed.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

CommandRunner = Callable[..., Any]
_WINDOWS_SUFFIXES = {".exe", ".msi"}
_APPLE_TEAM_ID_PATTERN = re.compile(r"^[A-Z0-9]{10}$")
_WINDOWS_SIGNATURE_SCRIPT = r"""
$signature = Get-AuthenticodeSignature -LiteralPath $args[0]
$subject = $null
if ($null -ne $signature.SignerCertificate) {
  $subject = $signature.SignerCertificate.Subject
}
[pscustomobject]@{
  Status = [string]$signature.Status
  Subject = $subject
} | ConvertTo-Json -Compress
""".strip()


def _configured_identity(label: str, value: str, *, max_length: int) -> str:
    """Return a bounded single-line configured signer identity or fail closed."""
    if not value or value != value.strip() or len(value) > max_length:
        raise ValueError(f"{label} must be configured exactly for release verification")
    if any(character in value for character in "\r\n\x00"):
        raise ValueError(f"{label} must be configured exactly for release verification")
    return value


def _regular_files(root: Path, suffixes: set[str], missing_label: str) -> list[Path]:
    """Return direct regular non-link release files with one of the allowed suffixes."""
    if not root.is_dir() or root.is_symlink():
        raise ValueError(f"{missing_label} directory is unavailable")
    matches: list[Path] = []
    for candidate in sorted(root.iterdir()):
        if candidate.suffix.lower() not in suffixes:
            continue
        if candidate.is_symlink() or not candidate.is_file():
            raise ValueError(f"{missing_label} must be a regular non-link file")
        matches.append(candidate)
    if not matches:
        raise ValueError(f"no {missing_label} was produced")
    return matches


def _application_bundles(bundle_root: Path) -> list[Path]:
    """Return direct regular macOS application bundles from the Tauri bundle directory."""
    if not bundle_root.is_dir() or bundle_root.is_symlink():
        raise ValueError("macOS application bundle directory is unavailable")
    applications: list[Path] = []
    for candidate in sorted(bundle_root.glob("*.app")):
        if candidate.is_symlink() or not candidate.is_dir():
            raise ValueError("macOS application bundle must be a regular non-link directory")
        applications.append(candidate)
    if not applications:
        raise ValueError("no macOS application bundle was produced")
    return applications


def _run_command(
    command: Sequence[str],
    *,
    runner: CommandRunner,
    failure_message: str,
) -> Any:
    """Run one fixed trust command and translate any nonzero result into a bounded error."""
    try:
        result = runner(
            list(command),
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as command_error:
        raise ValueError(failure_message) from command_error
    if result.returncode != 0:
        raise ValueError(failure_message)
    return result


def verify_windows_artifacts(
    artifact_root: Path,
    expected_publisher_subject: str,
    *,
    runner: CommandRunner = subprocess.run,
) -> list[Path]:
    """Verify Authenticode validity and the exact approved publisher for Windows installers."""
    expected_subject = _configured_identity(
        "Windows publisher subject", expected_publisher_subject, max_length=512
    )
    installers = _regular_files(
        artifact_root, _WINDOWS_SUFFIXES, "Windows release installer"
    )
    for installer in installers:
        result = _run_command(
            [
                "pwsh",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                _WINDOWS_SIGNATURE_SCRIPT,
                str(installer),
            ],
            runner=runner,
            failure_message="Windows release installer does not have a valid Authenticode signature",
        )
        try:
            signature = json.loads(result.stdout)
        except (json.JSONDecodeError, TypeError) as output_error:
            raise ValueError(
                "Windows release installer does not have a valid Authenticode signature"
            ) from output_error
        if not isinstance(signature, dict) or signature.get("Status") != "Valid":
            raise ValueError(
                "Windows release installer does not have a valid Authenticode signature"
            )
        if signature.get("Subject") != expected_subject:
            raise ValueError("Windows release installer is not signed by the approved Windows publisher")
    return installers


def _macos_team_identifier(details: str) -> str | None:
    """Extract the exact TeamIdentifier line from codesign display output."""
    for line in details.splitlines():
        if line.startswith("TeamIdentifier="):
            return line.removeprefix("TeamIdentifier=")
    return None


def verify_macos_artifacts(
    artifact_root: Path,
    bundle_root: Path,
    expected_team_id: str,
    *,
    runner: CommandRunner = subprocess.run,
) -> tuple[list[Path], list[Path]]:
    """Verify signed app bundles and stapled, Gatekeeper-accepted macOS disk images."""
    team_id = _configured_identity("Apple Team ID", expected_team_id, max_length=10)
    if _APPLE_TEAM_ID_PATTERN.fullmatch(team_id) is None:
        raise ValueError("Apple Team ID must be configured exactly for release verification")

    applications = _application_bundles(bundle_root)
    disk_images = _regular_files(artifact_root, {".dmg"}, "macOS release disk image")

    for application in applications:
        _run_command(
            ["codesign", "--verify", "--deep", "--strict", str(application)],
            runner=runner,
            failure_message="macOS application bundle does not have a valid code signature",
        )
        details = _run_command(
            ["codesign", "--display", "--verbose=4", str(application)],
            runner=runner,
            failure_message="macOS application bundle signing identity could not be verified",
        )
        signer_details = f"{details.stdout}\n{details.stderr}"
        if _macos_team_identifier(signer_details) != team_id:
            raise ValueError("macOS application bundle is not signed by the approved Apple Team ID")

    for disk_image in disk_images:
        _run_command(
            ["xcrun", "stapler", "validate", str(disk_image)],
            runner=runner,
            failure_message="macOS release disk image does not contain a valid notarization ticket",
        )
        _run_command(
            [
                "spctl",
                "--assess",
                "--type",
                "open",
                "--context",
                "context:primary-signature",
                "--verbose=2",
                str(disk_image),
            ],
            runner=runner,
            failure_message="macOS release disk image is not accepted by Gatekeeper",
        )
    return applications, disk_images


def _parser() -> argparse.ArgumentParser:
    """Build the command-line contract used by release jobs."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("windows", "macos"))
    parser.add_argument("artifact_root", type=Path)
    parser.add_argument("--bundle-root", type=Path)
    parser.add_argument("--expected-identity", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Verify one platform's release outputs and return a fail-closed process status."""
    arguments = _parser().parse_args(argv)
    try:
        if arguments.platform == "windows":
            verified = verify_windows_artifacts(
                arguments.artifact_root, arguments.expected_identity
            )
            print(f"Verified {len(verified)} Windows release installer(s).")
            return 0
        if arguments.bundle_root is None:
            raise ValueError("macOS release verification requires --bundle-root")
        applications, disk_images = verify_macos_artifacts(
            arguments.artifact_root,
            arguments.bundle_root,
            arguments.expected_identity,
        )
        print(
            "Verified "
            f"{len(applications)} macOS application bundle(s) and "
            f"{len(disk_images)} notarized disk image(s)."
        )
        return 0
    except ValueError as verification_error:
        print(f"Release platform trust verification failed: {verification_error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
