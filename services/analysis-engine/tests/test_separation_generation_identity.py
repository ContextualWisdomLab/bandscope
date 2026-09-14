"""Scientific-generation contracts for local Demucs separation."""

from __future__ import annotations

import pytest

from bandscope_analysis.separation import audio_separator, generation


def _version(package_name: str) -> str:
    """Return deterministic package versions without importing heavy ML runtimes."""
    return {"demucs": "4.0.1", "torch": "2.8.0"}[package_name]


def test_separation_generation_identity_binds_implementation_runtime_and_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cache generation must identify the BandScope code generation and Demucs artifact family."""
    monkeypatch.setattr(generation.importlib_metadata, "version", _version)

    identity = generation.separation_generation_identity()
    config = audio_separator.AudioSeparationConfig()

    assert identity == {
        "implementation": "bandscope-demucs",
        "implementationGeneration": generation.MIR_IMPLEMENTATION_GENERATION,
        "modelName": config.model_name,
        "checkpointName": "955717e8-8726e21a.th",
        "checkpointSignature": "955717e8",
        "checkpointChecksumPrefix": "8726e21a",
        "demucsVersion": "4.0.1",
        "torchVersion": "2.8.0",
        "targetSampleRate": config.target_sample_rate,
        "overlap": config.overlap,
        "device": config.device,
    }


def test_separation_generation_identity_rejects_missing_checkpoint_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown model generations cannot authorize reuse of prior separated features."""
    monkeypatch.setattr(audio_separator, "_DEMUCS_LOCAL_CHECKPOINTS", {})

    assert generation.separation_generation_identity() is None


def test_separation_generation_identity_rejects_malformed_checkpoint_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A checkpoint without the canonical signature/checksum tuple cannot identify a generation."""
    monkeypatch.setattr(
        audio_separator,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": "checkpoint-without-canonical-digest.th"},
    )

    assert generation.separation_generation_identity() is None


def test_separation_generation_identity_fails_closed_without_runtime_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing installed-runtime metadata disables cache equivalence instead of guessing it."""

    def missing_version(package_name: str) -> str:
        raise generation.importlib_metadata.PackageNotFoundError(package_name)

    monkeypatch.setattr(generation.importlib_metadata, "version", missing_version)

    assert generation.separation_generation_identity() is None
