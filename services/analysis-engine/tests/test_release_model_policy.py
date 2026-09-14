"""Distribution contracts for commercially admissible release model artifacts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_model_policy.py"
_IDENTITY_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_identity.py"
_PACKAGER_PATH = _REPOSITORY_ROOT / "scripts" / "release" / "package_desktop_artifact.py"
_EVIDENCE_BYTES = {
    "rightsEvidenceSha256": (
        "release/evidence/model-rights.txt",
        b"commercial rights grant for rehearsal separator\n",
    ),
    "provenanceEvidenceSha256": (
        "release/evidence/model-provenance.json",
        b'{"source":"cwl-owned-training-pipeline","version":1}\n',
    ),
    "loaderPolicySha256": (
        "release/evidence/model-loader-policy.json",
        b'{"serialization":"safetensors","network":false}\n',
    ),
}


def _load_module(module_name: str, module_path: Path) -> ModuleType:
    """Load one repository-owned executable guard for focused contract tests."""
    assert module_path.is_file(), f"release preflight guard is missing: {module_path.name}"
    module_spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _load_guard() -> ModuleType:
    """Load the Distribution-owned model release guard from its executable path."""
    return _load_module("verify_release_model_policy", _GUARD_PATH)


def _write_release_metadata(repository_root: Path, release_version: str) -> None:
    """Write the version projections consumed by the composed release preflight."""
    (repository_root / "apps" / "desktop" / "src-tauri").mkdir(parents=True)
    (repository_root / "VERSION").write_text(f"{release_version}\n", encoding="utf-8")
    (repository_root / "package.json").write_text(
        json.dumps({"name": "bandscope", "version": release_version}),
        encoding="utf-8",
    )
    (repository_root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json").write_text(
        json.dumps({"productName": "BandScope", "version": release_version}),
        encoding="utf-8",
    )


def _write_policy(
    repository_root: Path,
    *,
    release_status: str,
    admitted_artifact: dict[str, object] | None,
) -> Path:
    """Write a minimal release model policy for one isolated verifier scenario."""
    policy_path = repository_root / "release" / "model-artifact-policy.json"
    policy_path.parent.mkdir(parents=True, exist_ok=True)
    policy_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "releaseStatus": release_status,
                "blockedArtifact": {
                    "modelId": "demucs/htdemucs",
                    "checkpoint": "955717e8-8726e21a.th",
                    "reason": "commercial-rights-not-established",
                    "primaryEvidence": "https://github.com/facebookresearch/demucs/issues/327#issuecomment-1134828611",
                },
                "admittedArtifact": admitted_artifact,
            }
        ),
        encoding="utf-8",
    )
    return policy_path


def _write_evidence_files(repository_root: Path) -> dict[str, str]:
    """Create exact release evidence bytes and return their full SHA-256 bindings."""
    digests: dict[str, str] = {}
    for digest_field, (relative_path, payload) in _EVIDENCE_BYTES.items():
        evidence_path = repository_root / relative_path
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_bytes(payload)
        digests[digest_field] = hashlib.sha256(payload).hexdigest()
    return digests


def _admitted_artifact(
    repository_root: Path, artifact_path: str, payload: bytes
) -> dict[str, object]:
    """Build exact immutable metadata and backing evidence for an admitted test artifact."""
    evidence_digests = _write_evidence_files(repository_root)
    return {
        "modelId": "cwl/rehearsal-separator-v1",
        "modelVersion": "1.0.0",
        "path": artifact_path,
        "sizeBytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "serialization": "safetensors",
        **evidence_digests,
    }


def test_release_preflight_composes_model_policy_without_duplicate_workflow() -> None:
    """Keep one preflight guard while making artifact packaging enforce it independently."""
    identity_guard_text = _IDENTITY_GUARD_PATH.read_text(encoding="utf-8")
    quickcheck_text = (
        _REPOSITORY_ROOT / "scripts" / "harness" / "quickcheck.sh"
    ).read_text(encoding="utf-8")
    packager_text = _PACKAGER_PATH.read_text(encoding="utf-8")
    assert "verify_model_policy" in identity_guard_text
    assert "python3 scripts/checks/verify_release_identity.py" in quickcheck_text
    assert "python3 scripts/checks/verify_release_model_policy.py" not in quickcheck_text
    assert "verify_tag_release_preflight(repo_root)" in packager_text


def test_tag_packaging_requires_commercially_admitted_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reject a version-tag preflight when the release model remains legally blocked."""
    _write_release_metadata(tmp_path, "1.2.3")
    _write_policy(tmp_path, release_status="blocked", admitted_artifact=None)
    identity_guard = _load_module("verify_release_identity", _IDENTITY_GUARD_PATH)
    monkeypatch.setattr(identity_guard, "_REPOSITORY_ROOT", tmp_path)
    monkeypatch.setenv("GITHUB_REF_TYPE", "tag")
    monkeypatch.setenv("GITHUB_REF_NAME", "v1.2.3")
    assert identity_guard.main() == 1

    monkeypatch.delenv("GITHUB_REF_TYPE")
    monkeypatch.delenv("GITHUB_REF_NAME")
    assert identity_guard.main() == 0


def test_repository_policy_is_valid_but_blocks_commercial_tag_release() -> None:
    """Keep the known upstream-weight rights blocker executable in release policy."""
    guard = _load_guard()
    policy = guard.verify_model_policy(_REPOSITORY_ROOT, require_admitted=False)
    assert policy["releaseStatus"] == "blocked"
    assert policy["admittedArtifact"] is None

    with pytest.raises(ValueError, match="commercial model artifact is not admitted"):
        guard.verify_model_policy(_REPOSITORY_ROOT, require_admitted=True)


def test_admitted_artifact_requires_exact_size_and_full_sha256(tmp_path: Path) -> None:
    """Admit only the exact regular model bytes named by immutable release metadata."""
    guard = _load_guard()
    payload = b"rights-cleared-model-bytes"
    artifact_path = "release/models/rehearsal-separator-v1.safetensors"
    artifact_file = tmp_path / artifact_path
    artifact_file.parent.mkdir(parents=True)
    artifact_file.write_bytes(payload)
    _write_policy(
        tmp_path,
        release_status="admitted",
        admitted_artifact=_admitted_artifact(tmp_path, artifact_path, payload),
    )

    policy = guard.verify_model_policy(tmp_path, require_admitted=True)
    assert policy["admittedArtifact"]["sha256"] == hashlib.sha256(payload).hexdigest()

    artifact_file.write_bytes(payload + b"-changed")
    with pytest.raises(ValueError, match="model artifact size does not match policy"):
        guard.verify_model_policy(tmp_path, require_admitted=True)


def test_admitted_artifact_rejects_same_size_digest_mismatch(tmp_path: Path) -> None:
    """Reject same-size model substitution rather than treating byte count as identity."""
    guard = _load_guard()
    payload = b"model-A"
    artifact_path = "release/models/rehearsal-separator-v1.safetensors"
    artifact_file = tmp_path / artifact_path
    artifact_file.parent.mkdir(parents=True)
    artifact_file.write_bytes(payload)
    _write_policy(
        tmp_path,
        release_status="admitted",
        admitted_artifact=_admitted_artifact(tmp_path, artifact_path, payload),
    )
    artifact_file.write_bytes(b"model-B")

    with pytest.raises(ValueError, match="model artifact SHA-256 does not match policy"):
        guard.verify_model_policy(tmp_path, require_admitted=True)


def test_model_policy_rejects_duplicate_json_members(tmp_path: Path) -> None:
    """Reject ambiguous policy JSON instead of accepting a last-value-wins authority."""
    policy_path = tmp_path / "release" / "model-artifact-policy.json"
    policy_path.parent.mkdir(parents=True)
    policy_path.write_text(
        '{"schemaVersion":1,"schemaVersion":1,"releaseStatus":"blocked",'
        '"blockedArtifact":{},"admittedArtifact":null}',
        encoding="utf-8",
    )
    guard = _load_guard()

    with pytest.raises(ValueError, match="duplicate JSON member"):
        guard.verify_model_policy(tmp_path, require_admitted=False)


def test_model_policy_rejects_path_escape_and_symlink(tmp_path: Path) -> None:
    """Keep release model admission inside the repository and off link indirection."""
    guard = _load_guard()
    payload = b"model"
    _write_policy(
        tmp_path,
        release_status="admitted",
        admitted_artifact=_admitted_artifact(tmp_path, "../outside.safetensors", payload),
    )
    with pytest.raises(ValueError, match="model artifact path must be repository-relative"):
        guard.verify_model_policy(tmp_path, require_admitted=True)

    real_file = tmp_path / "real-model.safetensors"
    real_file.write_bytes(payload)
    link_path = tmp_path / "release" / "models" / "model.safetensors"
    link_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        link_path.symlink_to(real_file)
    except OSError:
        pytest.skip("symlinks are unavailable on this test platform")
    _write_policy(
        tmp_path,
        release_status="admitted",
        admitted_artifact=_admitted_artifact(
            tmp_path, "release/models/model.safetensors", payload
        ),
    )
    with pytest.raises(ValueError, match="model artifact must be a regular non-link file"):
        guard.verify_model_policy(tmp_path, require_admitted=True)


def test_model_policy_rejects_unknown_keys_and_malformed_evidence(tmp_path: Path) -> None:
    """Keep release authority schema exact and evidence digests unambiguous."""
    guard = _load_guard()
    payload = b"model"
    artifact_path = "release/models/model.safetensors"
    artifact_file = tmp_path / artifact_path
    artifact_file.parent.mkdir(parents=True)
    artifact_file.write_bytes(payload)
    admitted = _admitted_artifact(tmp_path, artifact_path, payload)
    admitted["unexpected"] = True
    _write_policy(tmp_path, release_status="admitted", admitted_artifact=admitted)
    with pytest.raises(ValueError, match="unexpected admittedArtifact fields"):
        guard.verify_model_policy(tmp_path, require_admitted=True)

    admitted = _admitted_artifact(tmp_path, artifact_path, payload)
    admitted["rightsEvidenceSha256"] = "not-a-digest"
    _write_policy(tmp_path, release_status="admitted", admitted_artifact=admitted)
    with pytest.raises(ValueError, match="rightsEvidenceSha256 must be a full SHA-256"):
        guard.verify_model_policy(tmp_path, require_admitted=True)


def test_admitted_artifact_rejects_tampered_evidence_bytes(tmp_path: Path) -> None:
    """Reject evidence files that no longer match the digests carried by release policy."""
    guard = _load_guard()
    payload = b"model"
    artifact_path = "release/models/model.safetensors"
    artifact_file = tmp_path / artifact_path
    artifact_file.parent.mkdir(parents=True)
    artifact_file.write_bytes(payload)
    admitted = _admitted_artifact(tmp_path, artifact_path, payload)
    _write_policy(tmp_path, release_status="admitted", admitted_artifact=admitted)
    (tmp_path / "release" / "evidence" / "model-rights.txt").write_bytes(
        b"tampered rights evidence\n"
    )

    with pytest.raises(ValueError, match="rights evidence SHA-256 does not match policy"):
        guard.verify_model_policy(tmp_path, require_admitted=True)
