"""Cache reuse contracts for MIR implementation and model generation identity."""

from __future__ import annotations

import pytest

import bandscope_analysis.final_result_cache as final_result_cache

_EXPECTED_MIR_GENERATION: dict[str, object] = {
    "implementation": "bandscope-demucs",
    "implementationGeneration": 1,
    "modelName": "htdemucs",
    "checkpointName": "955717e8-8726e21a.th",
    "checkpointSignature": "955717e8",
    "checkpointChecksumPrefix": "8726e21a",
    "demucsVersion": "4.0.1",
    "torchVersion": "2.8.0",
    "targetSampleRate": 22_050,
    "overlap": 0.25,
    "device": "cpu",
}


def _install_native_source_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provide deterministic native-owned source evidence for cache identity tests."""
    monkeypatch.setattr(
        final_result_cache,
        "_admitted_audio_evidence_from_environment",
        lambda: (4096, "a" * 64),
    )


def test_cache_identity_binds_current_mir_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    """A cache key must distinguish the MIR implementation/model generation that created it."""
    _install_native_source_evidence(monkeypatch)
    monkeypatch.setattr(
        final_result_cache,
        "separation_generation_identity",
        lambda: _EXPECTED_MIR_GENERATION,
        raising=False,
    )

    identity = final_result_cache.admitted_audio_cache_identity()

    assert identity is not None
    assert identity["fileSizeBytes"] == 4096
    assert identity["contentSha256"] == "a" * 64
    assert identity["mirGeneration"] == _EXPECTED_MIR_GENERATION


def test_cache_identity_fails_closed_when_mir_generation_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing model/runtime generation evidence must disable reuse instead of guessing equivalence."""
    _install_native_source_evidence(monkeypatch)
    monkeypatch.setattr(
        final_result_cache,
        "separation_generation_identity",
        lambda: None,
        raising=False,
    )

    with pytest.raises(ValueError, match="MIR generation identity is unavailable"):
        final_result_cache.admitted_audio_cache_identity()
