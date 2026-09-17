"""Runtime identity policy for real-audio corpus admission."""

from __future__ import annotations

from types import ModuleType

from conftest import load_module


def _admission() -> ModuleType:
    return load_module(
        "scripts/research/verify_structure_corpus.py",
        "verify_structure_corpus_runtime_identity",
    )


def test_runtime_digest_identity_is_hex_case_insensitive() -> None:
    """Validator-accepted uppercase hex must match lowercase runtime evidence."""
    admission = _admission()
    registration = {
        "runtime": {
            "source_commit": "A" * 40,
            "uv_lock_sha256": "B" * 64,
            "python_version": "3.12.11",
            "librosa_version": "0.11.0",
            "numpy_version": "2.3.3",
        }
    }
    runtime_identity = {
        "source_commit": "a" * 40,
        "uv_lock_sha256": "b" * 64,
        "python_version": "3.12.11",
        "librosa_version": "0.11.0",
        "numpy_version": "2.3.3",
    }

    normalized = admission._validate_runtime_identity(registration, runtime_identity)

    assert normalized["source_commit"] == "a" * 40
    assert normalized["uv_lock_sha256"] == "b" * 64
