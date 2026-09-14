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
_POLICY_PATH = _REPOSITORY_ROOT / "release" / "model-artifact-policy.json"
_BUILD_BASELINE_PATH = _REPOSITORY_ROOT / ".github" / "workflows" / "build-baseline.yml"


def _load_guard() -> ModuleType:
    """Load the Distribution-owned model release guard from its executable path."""
    assert _GUARD_PATH.is_file(), "release preflight must own a model artifact guard"
    guard_module_spec = importlib.util.spec_from_file_location(
        "verify_release_model_policy", _GUARD_PATH
    )
    assert guard_module_spec is not None and guard_module_spec.loader is not None
    guard_module = importlib.util.module_from_spec(guard_module_spec)
    guard_module_spec.loader.exec_module(guard_module)
    return guard_module


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


def _admitted_artifact(artifact_path: str, payload: bytes) -> dict[str, object]:
    """Build exact immutable metadata for an admitted test artifact."""
    return {
        "modelId": "cwl/rehearsal-separator-v1",
        "modelVersion": "1.0.0",
        "path": artifact_path,
        "sizeBytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "serialization": "safetensors",
        "rightsEvidenceSha256": "1" * 64,
        "provenanceEvidenceSha256": "2" * 64,
    }


def _workflow_job_block(workflow_text: str, job_name: str) -> str:
    """Return one top-level GitHub Actions job without a YAML parser dependency."""
    workflow_lines = workflow_text.splitlines()
    job_marker = f"  {job_name}:"
    try:
        start_index = workflow_lines.index(job_marker)
    except ValueError as lookup_error:
        raise AssertionError(f"workflow job is missing: {job_name}") from lookup_error

    end_index = len(workflow_lines)
    for line_index in range(start_index + 1, len(workflow_lines)):
        line = workflow_lines[line_index]
        if line.startswith("  ") and not line.startswith("    ") and line.endswith(":"):
            end_index = line_index
            break
    return "\n".join(workflow_lines[start_index:end_index])


def test_release_preflight_owns_model_policy_guard() -> None:
    """Require normal repository verification to validate the model policy document."""
    quickcheck_text = (
        _REPOSITORY_ROOT / "scripts" / "harness" / "quickcheck.sh"
    ).read_text(encoding="utf-8")
    assert "python3 scripts/checks/verify_release_model_policy.py" in quickcheck_text


def test_tag_build_requires_commercially_admitted_model_before_builds() -> None:
    """Fail a version-tag build before packaging when no model artifact is admitted."""
    workflow_text = _BUILD_BASELINE_PATH.read_text(encoding="utf-8")
    identity_job = _workflow_job_block(workflow_text, "release-identity")
    assert "python3 scripts/checks/verify_release_model_policy.py" in identity_job
    assert "--require-admitted" in identity_job


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
        admitted_artifact=_admitted_artifact(artifact_path, payload),
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
        admitted_artifact=_admitted_artifact(artifact_path, payload),
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
        admitted_artifact=_admitted_artifact("../outside.safetensors", payload),
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
            "release/models/model.safetensors", payload
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
    admitted = _admitted_artifact(artifact_path, payload)
    admitted["unexpected"] = True
    _write_policy(tmp_path, release_status="admitted", admitted_artifact=admitted)
    with pytest.raises(ValueError, match="unexpected admittedArtifact fields"):
        guard.verify_model_policy(tmp_path, require_admitted=True)

    admitted = _admitted_artifact(artifact_path, payload)
    admitted["rightsEvidenceSha256"] = "not-a-digest"
    _write_policy(tmp_path, release_status="admitted", admitted_artifact=admitted)
    with pytest.raises(ValueError, match="rightsEvidenceSha256 must be a full SHA-256"):
        guard.verify_model_policy(tmp_path, require_admitted=True)
