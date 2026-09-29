"""Release evidence binding contracts for commercially admitted model artifacts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_model_policy.py"


def _load_guard() -> ModuleType:
    """Load the Distribution-owned model release guard from its executable path."""
    module_spec = importlib.util.spec_from_file_location(
        "verify_release_model_policy_evidence_red", _GUARD_PATH
    )
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _write_admitted_policy(repository_root: Path, model_payload: bytes) -> None:
    """Write an admitted artifact whose evidence digests have no backing evidence files."""
    model_path = repository_root / "release" / "models" / "separator.safetensors"
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_bytes(model_payload)

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
                "admittedArtifact": {
                    "modelId": "cwl/rehearsal-separator-v1",
                    "modelVersion": "1.0.0",
                    "path": "release/models/separator.safetensors",
                    "sizeBytes": len(model_payload),
                    "sha256": hashlib.sha256(model_payload).hexdigest(),
                    "serialization": "safetensors",
                    "rightsEvidenceSha256": hashlib.sha256(b"rights").hexdigest(),
                    "provenanceEvidenceSha256": hashlib.sha256(b"provenance").hexdigest(),
                    "loaderPolicySha256": hashlib.sha256(b"loader-policy").hexdigest(),
                },
            }
        ),
        encoding="utf-8",
    )


def test_admitted_model_evidence_hashes_require_backing_files(tmp_path: Path) -> None:
    """Do not treat self-asserted evidence digests as evidence without immutable bytes."""
    guard = _load_guard()
    _write_admitted_policy(tmp_path, b"commercial-model")

    with pytest.raises(ValueError, match="rights evidence is missing"):
        guard.verify_model_policy(tmp_path, require_admitted=True)
