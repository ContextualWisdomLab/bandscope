"""Public export contract for playable stem artifact materialization."""

from __future__ import annotations

from bandscope_analysis.separation.playback_artifacts import (
    materialize_playable_stem_artifact_set,
)


def test_separation_package_exports_playable_artifact_contract() -> None:
    """The separation package exposes the artifact API to orchestration code."""
    from bandscope_analysis.separation import (
        NativePlayableStemArtifact,
        NativePlayableStemArtifactSet,
        PlaybackStemKind,
        materialize_playable_stem_artifact_set as exported_materializer,
    )

    assert NativePlayableStemArtifact.__name__ == "NativePlayableStemArtifact"
    assert NativePlayableStemArtifactSet.__name__ == "NativePlayableStemArtifactSet"
    assert PlaybackStemKind is not None
    assert exported_materializer is materialize_playable_stem_artifact_set
