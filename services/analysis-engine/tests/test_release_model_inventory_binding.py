"""Distribution contracts binding admitted model bytes to the shipped component inventory."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_model_policy.py"
_EVIDENCE = {
    "rightsEvidenceSha256": ("model-rights.txt", b"commercial rights evidence\n"),
    "provenanceEvidenceSha256": (
        "model-provenance.json",
        b'{"training":"cwl-owned","version":1}\n',
    ),
    "loaderPolicySha256": (
        "model-loader-policy.json",
        b'{"serialization":"safetensors","network":false}\n',
    ),
}


def _load_guard() -> ModuleType:
    """Load the Distribution-owned model admission guard."""
    module_spec = importlib.util.spec_from_file_location(
        "verify_release_model_policy_inventory", _GUARD_PATH
    )
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _write_admitted_release(repository_root: Path) -> tuple[dict[str, object], bytes]:
    """Write exact model/evidence bytes and an admitted release policy."""
    model_payload = b"commercially-admitted-model"
    model_path = "release/models/cwl-rehearsal-separator-v1.safetensors"
    artifact_path = repository_root / model_path
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_bytes(model_payload)

    evidence_dir = repository_root / "release" / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence_digests: dict[str, str] = {}
    for field, (filename, payload) in _EVIDENCE.items():
        (evidence_dir / filename).write_bytes(payload)
        evidence_digests[field] = hashlib.sha256(payload).hexdigest()

    admitted: dict[str, object] = {
        "modelId": "cwl/rehearsal-separator-v1",
        "modelVersion": "1.0.0",
        "path": model_path,
        "sizeBytes": len(model_payload),
        "sha256": hashlib.sha256(model_payload).hexdigest(),
        "serialization": "safetensors",
        **evidence_digests,
    }
    policy_path = repository_root / "release" / "model-artifact-policy.json"
    policy_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "releaseStatus": "admitted",
                "blockedArtifact": {
                    "modelId": "demucs/htdemucs",
                    "checkpoint": "955717e8-8726e21a.th",
                    "reason": "commercial-rights-not-established",
                    "primaryEvidence": "https://github.com/facebookresearch/demucs/issues/327#issuecomment-1134828611",
                },
                "admittedArtifact": admitted,
            }
        ),
        encoding="utf-8",
    )
    return admitted, model_payload


def _write_inventory(repository_root: Path, admitted: dict[str, object]) -> Path:
    """Write the minimum repository inventory entry for one admitted model."""
    inventory_path = repository_root / "supply-chain" / "supplemental-component-inventory.json"
    inventory_path.parent.mkdir(parents=True, exist_ok=True)
    inventory_path.write_text(
        json.dumps(
            {
                "version": 1,
                "generatedBy": "test fixture",
                "bundledBinaries": [],
                "modelArtifacts": [
                    {
                        "name": admitted["modelId"],
                        "version": admitted["modelVersion"],
                        "sourceUrl": "local-repo://release/models/cwl-rehearsal-separator-v1.safetensors",
                        "license": "Proprietary",
                        "checksum": f"sha256:{admitted['sha256']}",
                        "storagePath": admitted["path"],
                        "releaseUsage": "Packaged offline rehearsal source-separation model.",
                        "verification": "Distribution release admission full SHA-256.",
                    }
                ],
                "notes": [],
            }
        ),
        encoding="utf-8",
    )
    return inventory_path


def test_admitted_model_requires_backing_supply_chain_inventory(tmp_path: Path) -> None:
    """Reject commercially admitted model bytes that are absent from shipped inventory."""
    guard = _load_guard()
    _write_admitted_release(tmp_path)

    with pytest.raises(ValueError, match="supplemental model inventory is missing"):
        guard.verify_model_policy(tmp_path, require_admitted=True)


def test_admitted_model_matches_exact_inventory_identity(tmp_path: Path) -> None:
    """Accept inventory only when model ID/version/path/full digest match release policy."""
    guard = _load_guard()
    admitted, _ = _write_admitted_release(tmp_path)
    _write_inventory(tmp_path, admitted)

    policy = guard.verify_model_policy(tmp_path, require_admitted=True)
    assert policy["admittedArtifact"]["modelId"] == admitted["modelId"]


def test_admitted_model_rejects_inventory_digest_substitution(tmp_path: Path) -> None:
    """Reject an inventory entry that names the model but binds different artifact bytes."""
    guard = _load_guard()
    admitted, _ = _write_admitted_release(tmp_path)
    inventory_path = _write_inventory(tmp_path, admitted)
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    inventory["modelArtifacts"][0]["checksum"] = f"sha256:{'0' * 64}"
    inventory_path.write_text(json.dumps(inventory), encoding="utf-8")

    with pytest.raises(ValueError, match="supplemental model inventory does not match admitted artifact"):
        guard.verify_model_policy(tmp_path, require_admitted=True)
