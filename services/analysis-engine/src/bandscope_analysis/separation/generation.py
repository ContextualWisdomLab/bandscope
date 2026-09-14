"""Versioned scientific-generation identity for local source separation.

The model/checkpoint mapping stays owned by :mod:`audio_separator`.  This adapter
reads that canonical mapping instead of copying it so persistence can invalidate
derived caches when the MIR implementation, runtime, or admitted model generation
changes.  The checkpoint filename contains only the Demucs checksum prefix; full
release digest/signature/rights provenance remains a Distribution responsibility.
"""

from __future__ import annotations

import importlib.metadata as importlib_metadata
from typing import TypedDict

from . import audio_separator

MIR_IMPLEMENTATION_GENERATION = 1


class SeparationGenerationIdentity(TypedDict):
    """Stable fields that determine whether persisted separation features are reusable."""

    implementation: str
    implementationGeneration: int
    modelName: str
    checkpointName: str
    checkpointSignature: str
    checkpointChecksumPrefix: str
    demucsVersion: str
    torchVersion: str
    targetSampleRate: int
    overlap: float
    device: str


def separation_generation_identity() -> SeparationGenerationIdentity | None:
    """Return the current default separation generation, or ``None`` if it is unverifiable.

    Cache admission uses the production default separator configuration.  Package
    metadata lookup avoids importing Demucs or torch just to decide whether stale
    derived features may be reused.  Missing package metadata therefore disables
    cache reuse rather than treating two runtimes as scientifically equivalent.
    """
    config = audio_separator.AudioSeparationConfig()
    checkpoint_name = audio_separator._DEMUCS_LOCAL_CHECKPOINTS.get(config.model_name)
    if checkpoint_name is None:
        return None
    checkpoint_identity = audio_separator._checkpoint_signature_and_checksum(checkpoint_name)
    if checkpoint_identity is None:
        return None
    checkpoint_signature, checkpoint_checksum_prefix = checkpoint_identity

    try:
        demucs_version = importlib_metadata.version("demucs")
        torch_version = importlib_metadata.version("torch")
    except importlib_metadata.PackageNotFoundError:
        return None

    return {
        "implementation": "bandscope-demucs",
        "implementationGeneration": MIR_IMPLEMENTATION_GENERATION,
        "modelName": config.model_name,
        "checkpointName": checkpoint_name,
        "checkpointSignature": checkpoint_signature,
        "checkpointChecksumPrefix": checkpoint_checksum_prefix,
        "demucsVersion": demucs_version,
        "torchVersion": torch_version,
        "targetSampleRate": config.target_sample_rate,
        "overlap": config.overlap,
        "device": config.device,
    }
