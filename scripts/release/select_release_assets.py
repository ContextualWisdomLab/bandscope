"""Select and re-admit a strict release graph for immutable publication.

Security Notes:
    The publisher accepts only target-qualified BandScope installer/updater/receipt
    names for the exact release commit. Target receipts are bounded, duplicate-key
    rejecting, and their installer/updater size+SHA-256 bindings are revalidated
    after GitHub artifact upload/download extraction. No receipt field becomes a
    filesystem path unless it first matches the already allowlisted target files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any, Iterable

TARGET_INSTALLER_SUFFIXES = {
    ("windows", "amd64"): {".exe", ".msi"},
    ("windows", "arm64"): {".exe", ".msi"},
    ("macos", "amd64"): {".dmg"},
    ("macos", "arm64"): {".dmg"},
}
RELEASE_METADATA = [
    Path("bandscope-sbom.cdx.json"),
    Path("supply-chain/supplemental-component-inventory.json"),
]
_FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_MAX_RECEIPT_BYTES = 256 * 1024
_MAX_UPDATER_SIGNATURE_BYTES = 64 * 1024
_RECEIPT_KEYS = frozenset(
    {"schemaVersion", "version", "tag", "sourceCommit", "target", "artifacts", "updaterArtifacts"}
)
_INSTALLER_RECEIPT_KEYS = frozenset(
    {"archive", "sizeBytes", "sha256", "checksumFile", "manifestFile"}
)
_UPDATER_RECEIPT_KEYS = frozenset(
    {"bundle", "sizeBytes", "sha256", "signatureFile", "signatureSizeBytes", "signatureSha256"}
)
_TARGET_RECEIPT_KEYS = frozenset({"platform", "arch", "targetTriple"})


def _artifact_pattern(git_sha: str) -> re.Pattern[str]:
    """Return the strict installer/updater/receipt filename pattern for one commit."""
    short_sha = re.escape(git_sha[:12])
    return re.compile(
        rf"^bandscope-(?P<platform>windows|macos)-(?P<arch>amd64|arm64)-{short_sha}(?:"
        r"(?P<installer_suffix>\.(?:exe|msi|dmg))(?P<sidecar>\.sha256|\.manifest\.txt)?"
        r"|(?P<windows_signature>\.(?:exe|msi)\.sig)"
        r"|(?P<mac_bundle>\.app\.tar\.gz)(?P<mac_signature>\.sig)?"
        r"|(?P<receipt>\.release-receipt\.json)"
        r")$"
    )


def _installer_name_for_artifact(filename: str) -> str:
    """Return the installer archive filename for a checksum/manifest or archive name."""
    for suffix in [".manifest.txt", ".sha256"]:
        if filename.endswith(suffix):
            return filename[: -len(suffix)]
    return filename


def _ensure_file(path: Path) -> None:
    """Raise if a required release asset path is missing or not a file."""
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"missing release asset: {path.as_posix()}")


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a JSON object while rejecting parser-dependent duplicate members."""
    document: dict[str, Any] = {}
    for key, value in pairs:
        if key in document:
            raise ValueError(f"duplicate release receipt member: {key}")
        document[key] = value
    return document


def _stable_file_identity(
    path: Path,
    *,
    label: str,
    maximum_bytes: int | None = None,
) -> tuple[int, str]:
    """Return exact size/digest for one stable regular non-link publication file."""
    if path.is_symlink():
        raise ValueError(f"{label} must be a regular non-link file")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ValueError(f"{label} could not be opened") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{label} must be a regular non-link file")
        if maximum_bytes is not None and before.st_size > maximum_bytes:
            raise ValueError(f"{label} exceeds its bounded size policy")
        digest = hashlib.sha256()
        read_bytes = 0
        with os.fdopen(descriptor, "rb", closefd=False) as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                read_bytes += len(chunk)
                if maximum_bytes is not None and read_bytes > maximum_bytes:
                    raise ValueError(f"{label} exceeds its bounded size policy")
                digest.update(chunk)
        after = os.fstat(descriptor)
        if (before.st_dev, before.st_ino, before.st_size) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
        ) or read_bytes != before.st_size:
            raise ValueError(f"{label} changed while being read")
        return before.st_size, digest.hexdigest()
    finally:
        os.close(descriptor)


def _load_receipt(path: Path) -> dict[str, Any]:
    """Load one bounded target receipt with duplicate-member rejection."""
    size_bytes, _ = _stable_file_identity(
        path, label="release receipt", maximum_bytes=_MAX_RECEIPT_BYTES
    )
    if size_bytes < 1:
        raise ValueError("release receipt must not be empty")
    try:
        raw = path.read_bytes()
        if len(raw) != size_bytes:
            raise ValueError("release receipt changed after admission")
        document = json.loads(
            raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_pairs
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("release receipt is not valid UTF-8 JSON") from error
    if not isinstance(document, dict) or frozenset(document) != _RECEIPT_KEYS:
        raise ValueError("release receipt keys do not match the versioned contract")
    return document


def _exact_nonnegative_int(value: Any, *, field_name: str) -> int:
    """Return an exact nonnegative integer without accepting booleans/coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"release receipt {field_name} must be a nonnegative integer")
    return value


def _exact_sha256(value: Any, *, field_name: str) -> str:
    """Return one lowercase full SHA-256 receipt field."""
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"release receipt {field_name} must be a full SHA-256")
    return value


def _checksum_digest(path: Path, archive_name: str) -> str:
    """Return the exact digest from one packaged checksum sidecar."""
    _ensure_file(path)
    if path.stat().st_size > 512:
        raise ValueError(f"release checksum is unexpectedly large: {path.name}")
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeError as error:
        raise ValueError(f"release checksum is not UTF-8: {path.name}") from error
    match = re.fullmatch(r"([0-9a-f]{64})  ([^\r\n]+)\n", text)
    if match is None or match.group(2) != archive_name:
        raise ValueError(f"release checksum is malformed: {path.name}")
    return match.group(1)


def _validate_receipt_identity(
    receipt: dict[str, Any],
    *,
    target: tuple[str, str],
    git_sha: str,
) -> None:
    """Validate receipt version/source/target authority before resolving file names."""
    if receipt.get("schemaVersion") != 1:
        raise ValueError("release receipt schemaVersion must equal 1")
    version = receipt.get("version")
    tag = receipt.get("tag")
    if not isinstance(version, str) or not version or version != version.strip():
        raise ValueError("release receipt version must be a non-empty trimmed string")
    if tag != f"v{version}":
        raise ValueError("release receipt tag does not match its version")
    source_commit = receipt.get("sourceCommit")
    if not isinstance(source_commit, str) or _FULL_SHA_RE.fullmatch(source_commit) is None:
        raise ValueError("release receipt sourceCommit must be a full Git SHA")
    if source_commit[:12] != git_sha[:12] or (len(git_sha) == 40 and source_commit != git_sha):
        raise ValueError("release receipt sourceCommit does not match release publication head")
    receipt_target = receipt.get("target")
    if not isinstance(receipt_target, dict) or frozenset(receipt_target) != _TARGET_RECEIPT_KEYS:
        raise ValueError("release receipt target does not match the versioned contract")
    if (receipt_target.get("platform"), receipt_target.get("arch")) != target:
        raise ValueError("release receipt target does not match its filename target")
    target_triple = receipt_target.get("targetTriple")
    if not isinstance(target_triple, str) or not target_triple or target_triple != target_triple.strip():
        raise ValueError("release receipt targetTriple must be a non-empty trimmed string")


def _validate_installer_entries(
    artifacts_dir: Path,
    receipt: dict[str, Any],
    expected_installers: set[str],
) -> None:
    """Re-admit every receipt-bound installer and checksum after artifact transfer."""
    entries = receipt.get("artifacts")
    if not isinstance(entries, list) or not entries:
        raise ValueError("release receipt must contain installer artifacts")
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or frozenset(entry) != _INSTALLER_RECEIPT_KEYS:
            raise ValueError("release receipt installer entry keys are invalid")
        archive = entry.get("archive")
        if not isinstance(archive, str) or archive not in expected_installers or archive in seen:
            raise ValueError("release receipt installer set does not match extracted artifacts")
        seen.add(archive)
        checksum_name = entry.get("checksumFile")
        manifest_name = entry.get("manifestFile")
        if checksum_name != f"{archive}.sha256" or manifest_name != f"{archive}.manifest.txt":
            raise ValueError("release receipt installer sidecars do not match archive")
        _ensure_file(artifacts_dir / str(manifest_name))
        expected_digest = _checksum_digest(artifacts_dir / str(checksum_name), archive)
        size_bytes, digest = _stable_file_identity(
            artifacts_dir / archive, label="release receipt installer"
        )
        if size_bytes != _exact_nonnegative_int(entry.get("sizeBytes"), field_name="sizeBytes"):
            raise ValueError("release receipt installer size does not match extracted bytes")
        receipt_digest = _exact_sha256(entry.get("sha256"), field_name="sha256")
        if digest != receipt_digest or digest != expected_digest:
            raise ValueError("release receipt installer digest does not match extracted bytes")
    if seen != expected_installers:
        raise ValueError("release receipt does not cover every extracted installer")


def _validate_updater_entries(
    artifacts_dir: Path,
    receipt: dict[str, Any],
    expected_updaters: dict[str, str],
) -> None:
    """Re-admit updater bundle/signature bytes bound by the target receipt."""
    entries = receipt.get("updaterArtifacts")
    if not isinstance(entries, list) or not entries:
        raise ValueError("release receipt must contain updaterArtifacts")
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or frozenset(entry) != _UPDATER_RECEIPT_KEYS:
            raise ValueError("release receipt updater entry keys are invalid")
        bundle = entry.get("bundle")
        signature = entry.get("signatureFile")
        if (
            not isinstance(bundle, str)
            or not isinstance(signature, str)
            or expected_updaters.get(bundle) != signature
            or bundle in seen
        ):
            raise ValueError("release receipt updater set does not match extracted artifacts")
        seen.add(bundle)
        bundle_size, bundle_digest = _stable_file_identity(
            artifacts_dir / bundle, label="release receipt updater bundle"
        )
        if bundle_size != _exact_nonnegative_int(entry.get("sizeBytes"), field_name="sizeBytes"):
            raise ValueError("release receipt updater bundle size does not match extracted bytes")
        if bundle_digest != _exact_sha256(entry.get("sha256"), field_name="sha256"):
            raise ValueError("release receipt updater bundle digest does not match extracted bytes")
        signature_size, signature_digest = _stable_file_identity(
            artifacts_dir / signature,
            label="release receipt updater signature",
            maximum_bytes=_MAX_UPDATER_SIGNATURE_BYTES,
        )
        if signature_size < 1:
            raise ValueError("release receipt updater signature must not be empty")
        if signature_size != _exact_nonnegative_int(
            entry.get("signatureSizeBytes"), field_name="signatureSizeBytes"
        ):
            raise ValueError("release receipt updater signature size does not match extracted bytes")
        if signature_digest != _exact_sha256(
            entry.get("signatureSha256"), field_name="signatureSha256"
        ):
            raise ValueError("release receipt updater signature digest does not match extracted bytes")
    if seen != set(expected_updaters):
        raise ValueError("release receipt does not cover every extracted updater bundle")


def _validate_target_receipt(
    artifacts_dir: Path,
    receipt_path: Path,
    *,
    target: tuple[str, str],
    git_sha: str,
    installers: set[str],
    updater_bundles: dict[str, str],
) -> None:
    """Validate one target receipt against the exact extracted publication bytes."""
    receipt = _load_receipt(receipt_path)
    _validate_receipt_identity(receipt, target=target, git_sha=git_sha)
    _validate_installer_entries(artifacts_dir, receipt, installers)
    _validate_updater_entries(artifacts_dir, receipt, updater_bundles)


def _normalized_git_sha(git_sha: str | None) -> str:
    """Return 12- or 40-hex release identity, preferring the full Actions SHA."""
    value = (git_sha or os.environ.get("GITHUB_SHA") or "").lower()
    if re.fullmatch(r"[0-9a-f]{12}|[0-9a-f]{40}", value) is None:
        raise ValueError("release asset selection requires a 12- or 40-hex Git SHA")
    return value


def select_release_assets(repo_root: Path, git_sha: str | None = None) -> list[str]:
    """Return publication assets after target graph and receipt re-admission."""
    effective_sha = _normalized_git_sha(git_sha)
    artifacts_dir = repo_root / "artifacts"
    if not artifacts_dir.is_dir() or artifacts_dir.is_symlink():
        raise ValueError("missing release artifact directory: artifacts")

    for metadata_path in RELEASE_METADATA:
        _ensure_file(repo_root / metadata_path)

    pattern = _artifact_pattern(effective_sha)
    installers_by_target: dict[tuple[str, str], set[str]] = {
        target: set() for target in TARGET_INSTALLER_SUFFIXES
    }
    sidecars_by_installer: dict[str, set[str]] = {}
    windows_signatures: dict[tuple[str, str], set[str]] = {
        target: set() for target in TARGET_INSTALLER_SUFFIXES if target[0] == "windows"
    }
    mac_bundles: dict[tuple[str, str], set[str]] = {
        target: set() for target in TARGET_INSTALLER_SUFFIXES if target[0] == "macos"
    }
    mac_signatures: dict[tuple[str, str], set[str]] = {
        target: set() for target in TARGET_INSTALLER_SUFFIXES if target[0] == "macos"
    }
    receipts: dict[tuple[str, str], list[Path]] = {
        target: [] for target in TARGET_INSTALLER_SUFFIXES
    }
    selected_artifacts: list[str] = []

    for artifact_path in sorted(artifacts_dir.iterdir(), key=lambda path: path.name):
        if artifact_path.is_symlink() or not artifact_path.is_file():
            raise ValueError(f"unexpected release artifact path: {artifact_path.name}")
        match = pattern.fullmatch(artifact_path.name)
        if match is None:
            raise ValueError(f"unexpected release artifact: {artifact_path.name}")

        target = (match.group("platform"), match.group("arch"))
        installer_suffix = match.group("installer_suffix")
        if installer_suffix is not None:
            if installer_suffix not in TARGET_INSTALLER_SUFFIXES[target]:
                raise ValueError(
                    f"unexpected installer suffix for {target[0]}-{target[1]}: {artifact_path.name}"
                )
            installer_name = _installer_name_for_artifact(artifact_path.name)
            sidecar = match.group("sidecar")
            if sidecar is None:
                installers_by_target[target].add(installer_name)
            else:
                sidecars_by_installer.setdefault(installer_name, set()).add(sidecar)
        elif match.group("windows_signature") is not None:
            if target[0] != "windows":
                raise ValueError(f"unexpected Windows updater signature: {artifact_path.name}")
            windows_signatures[target].add(artifact_path.name)
        elif match.group("mac_bundle") is not None:
            if target[0] != "macos":
                raise ValueError(f"unexpected macOS updater artifact: {artifact_path.name}")
            if match.group("mac_signature") is None:
                mac_bundles[target].add(artifact_path.name)
            else:
                mac_signatures[target].add(artifact_path.name)
        elif match.group("receipt") is not None:
            receipts[target].append(artifact_path)
        else:
            raise ValueError(f"unexpected release artifact: {artifact_path.name}")
        selected_artifacts.append(f"artifacts/{artifact_path.name}")

    for target in TARGET_INSTALLER_SUFFIXES:
        if not installers_by_target[target]:
            raise ValueError(f"missing installer for {target[0]}-{target[1]}")
        if len(receipts[target]) != 1:
            raise ValueError(f"expected one release receipt for {target[0]}-{target[1]}")

    installer_names = set().union(*installers_by_target.values())
    for installer_name in sorted(installer_names):
        sidecars = sidecars_by_installer.get(installer_name, set())
        if ".sha256" not in sidecars:
            raise ValueError(f"missing checksum for {installer_name}")
        if ".manifest.txt" not in sidecars:
            raise ValueError(f"missing manifest for {installer_name}")
    for installer_name in sorted(sidecars_by_installer):
        if installer_name not in installer_names:
            raise ValueError(f"sidecar without installer: {installer_name}")

    expected_updaters: dict[tuple[str, str], dict[str, str]] = {}
    for target, installers in installers_by_target.items():
        if target[0] == "windows":
            expected = {installer: f"{installer}.sig" for installer in installers}
            if set(expected.values()) != windows_signatures[target]:
                raise ValueError(f"Windows updater signatures incomplete for {target[0]}-{target[1]}")
            expected_updaters[target] = expected
            continue
        if len(mac_bundles[target]) != 1:
            raise ValueError(f"expected one macOS updater bundle for {target[0]}-{target[1]}")
        bundle = next(iter(mac_bundles[target]))
        expected_signature = f"{bundle}.sig"
        if mac_signatures[target] != {expected_signature}:
            raise ValueError(f"macOS updater signature incomplete for {target[0]}-{target[1]}")
        expected_updaters[target] = {bundle: expected_signature}

    for target in TARGET_INSTALLER_SUFFIXES:
        _validate_target_receipt(
            artifacts_dir,
            receipts[target][0],
            target=target,
            git_sha=effective_sha,
            installers=installers_by_target[target],
            updater_bundles=expected_updaters[target],
        )

    return [
        *sorted(selected_artifacts),
        *(path.as_posix() for path in RELEASE_METADATA),
    ]


def write_asset_list(output_path: Path, assets: Iterable[str]) -> None:
    """Write release asset paths one per line for workflow consumption."""
    output_path.write_text("\n".join(assets) + "\n", encoding="utf-8")


def read_asset_list(input_path: Path) -> list[str]:
    """Return release asset paths from a previously generated allowlist."""
    if input_path.is_symlink() or not input_path.is_file():
        raise ValueError(f"missing release asset list: {input_path.as_posix()}")
    return [
        line.strip() for line in input_path.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


def validate_asset_list(input_path: Path, expected_assets: list[str]) -> None:
    """Raise if a release asset list diverges from the strict allowlist."""
    actual_assets = read_asset_list(input_path)
    if actual_assets != expected_assets:
        raise ValueError(
            f"release asset list {input_path.as_posix()} does not match strict allowlist"
        )


def main() -> int:
    """Validate release artifacts and write a strict asset list."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        help="Path to an existing asset list to validate against the strict allowlist.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Path to write the selected release asset list. Prints to stdout when omitted.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path.cwd(),
        help="Repository root containing artifacts/ and release metadata.",
    )
    parser.add_argument(
        "--git-sha",
        default=os.environ.get("GITHUB_SHA"),
        help="Commit SHA embedded in artifact names. Defaults to GITHUB_SHA.",
    )
    args = parser.parse_args()

    try:
        assets = select_release_assets(args.repo_root, git_sha=args.git_sha)
        if args.input is not None:
            validate_asset_list(args.input, assets)
            if args.output is None:
                return 0
    except ValueError as exc:
        print(f"Release asset validation failed: {exc}", file=sys.stderr)
        return 1

    if args.output is not None:
        write_asset_list(args.output, assets)
    else:
        print("\n".join(assets))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
