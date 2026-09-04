"""Behavioral contract for local playable-stem artifact materialization."""

from __future__ import annotations

import hashlib
import os
import wave
from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.separation.playback_artifacts import (
    CANONICAL_PLAYBACK_STEM_KINDS,
    materialize_playable_stem_artifact_set,
)


ARTIFACT_SET_ID = "a" * 64
SAMPLE_RATE_HZ = 8_000


def sample_stem_arrays(*, sample_peak: float = 0.5) -> dict[str, np.ndarray]:
    """Return four aligned floating-point sources with distinguishable levels."""
    sample_axis = np.linspace(-sample_peak, sample_peak, 16, dtype=np.float32)
    return {
        "vocals": sample_axis,
        "bass": sample_axis * np.float32(0.5),
        "drums": sample_axis * np.float32(0.25),
        "other": sample_axis * np.float32(0.125),
    }


def read_wave_samples(file_path: Path) -> tuple[int, int, int, np.ndarray]:
    """Read the generated mono PCM16 file for exact contract assertions."""
    with wave.open(str(file_path), "rb") as wave_reader:
        channel_count = wave_reader.getnchannels()
        sample_width_bytes = wave_reader.getsampwidth()
        sample_rate_hz = wave_reader.getframerate()
        frame_bytes = wave_reader.readframes(wave_reader.getnframes())
    sample_values = np.frombuffer(frame_bytes, dtype="<i2")
    return channel_count, sample_width_bytes, sample_rate_hz, sample_values


def test_materializer_writes_exact_aligned_pcm16_artifact_set(tmp_path: Path) -> None:
    """All four canonical sources become aligned mono PCM16 WAV artifacts."""
    artifact_result = materialize_playable_stem_artifact_set(
        stem_arrays=sample_stem_arrays(),
        sample_rate_hz=SAMPLE_RATE_HZ,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )

    assert artifact_result["artifactSetId"] == ARTIFACT_SET_ID
    assert artifact_result["formatVersion"] == 1
    assert artifact_result["sampleRate"] == SAMPLE_RATE_HZ
    assert artifact_result["channelCount"] == 1
    assert artifact_result["sampleCount"] == 16
    assert artifact_result["durationSeconds"] == pytest.approx(16 / SAMPLE_RATE_HZ)
    assert artifact_result["appliedGain"] == pytest.approx(1.0)
    assert [
        stem_artifact["stemKind"] for stem_artifact in artifact_result["stemArtifacts"]
    ] == list(CANONICAL_PLAYBACK_STEM_KINDS)

    for stem_artifact in artifact_result["stemArtifacts"]:
        artifact_path = Path(stem_artifact["nativeFilePath"])
        assert artifact_path.is_relative_to(tmp_path.resolve())
        assert artifact_path.name == f'{stem_artifact["stemKind"]}.wav'
        assert stem_artifact["artifactId"] == f'stem-{stem_artifact["stemKind"]}'
        assert stem_artifact["mediaType"] == "audio/wav"
        assert stem_artifact["fileSizeBytes"] == artifact_path.stat().st_size
        assert stem_artifact["contentHashSha256"] == hashlib.sha256(
            artifact_path.read_bytes()
        ).hexdigest()
        assert stem_artifact["sampleRate"] == SAMPLE_RATE_HZ
        assert stem_artifact["channelCount"] == 1
        assert stem_artifact["sampleCount"] == 16
        assert stem_artifact["durationSeconds"] == pytest.approx(16 / SAMPLE_RATE_HZ)
        channel_count, sample_width_bytes, sample_rate_hz, sample_values = read_wave_samples(
            artifact_path
        )
        assert channel_count == 1
        assert sample_width_bytes == 2
        assert sample_rate_hz == SAMPLE_RATE_HZ
        assert sample_values.size == 16


def test_materializer_uses_one_set_wide_gain_without_per_stem_normalization(
    tmp_path: Path,
) -> None:
    """Peak protection preserves the relative amplitude between different stems."""
    stem_arrays = sample_stem_arrays(sample_peak=2.0)
    artifact_result = materialize_playable_stem_artifact_set(
        stem_arrays=stem_arrays,
        sample_rate_hz=SAMPLE_RATE_HZ,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )

    assert 0.0 < artifact_result["appliedGain"] < 0.5
    stem_artifacts = {
        stem_artifact["stemKind"]: stem_artifact
        for stem_artifact in artifact_result["stemArtifacts"]
    }
    _, _, _, vocal_samples = read_wave_samples(
        Path(stem_artifacts["vocals"]["nativeFilePath"])
    )
    _, _, _, bass_samples = read_wave_samples(
        Path(stem_artifacts["bass"]["nativeFilePath"])
    )
    vocal_peak = int(np.max(np.abs(vocal_samples.astype(np.int32))))
    bass_peak = int(np.max(np.abs(bass_samples.astype(np.int32))))
    assert vocal_peak <= 32_767
    assert bass_peak / vocal_peak == pytest.approx(0.5, abs=2 / 32_767)


@pytest.mark.parametrize(
    ("invalid_sample_rate", "expected_message"),
    [
        (True, "sample rate"),
        (7_999, "sample rate"),
        (192_001, "sample rate"),
        (8_000.0, "sample rate"),
    ],
)
def test_materializer_rejects_invalid_sample_rate(
    tmp_path: Path,
    invalid_sample_rate: object,
    expected_message: str,
) -> None:
    """Only bounded integer sample rates may become media metadata."""
    with pytest.raises(ValueError, match=expected_message):
        materialize_playable_stem_artifact_set(
            stem_arrays=sample_stem_arrays(),
            sample_rate_hz=invalid_sample_rate,  # type: ignore[arg-type]
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )


@pytest.mark.parametrize(
    "invalid_artifact_set_id",
    ["", "A" * 64, "a" * 63, "a" * 65, "../" + "a" * 61],
)
def test_materializer_rejects_invalid_artifact_set_identity(
    tmp_path: Path,
    invalid_artifact_set_id: str,
) -> None:
    """Artifact directories are selected only by a lowercase SHA-256 identity."""
    with pytest.raises(ValueError, match="artifact set"):
        materialize_playable_stem_artifact_set(
            stem_arrays=sample_stem_arrays(),
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=invalid_artifact_set_id,
        )


@pytest.mark.parametrize("missing_stem_kind", CANONICAL_PLAYBACK_STEM_KINDS)
def test_materializer_rejects_missing_canonical_stem(
    tmp_path: Path,
    missing_stem_kind: str,
) -> None:
    """A partial separation result cannot become a success-shaped artifact set."""
    stem_arrays = sample_stem_arrays()
    del stem_arrays[missing_stem_kind]
    with pytest.raises(ValueError, match="canonical stems"):
        materialize_playable_stem_artifact_set(
            stem_arrays=stem_arrays,
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )


def test_materializer_rejects_unknown_stem(tmp_path: Path) -> None:
    """Model-specific unknown sources cannot silently expand the public contract."""
    stem_arrays = sample_stem_arrays()
    stem_arrays["guitar"] = np.zeros(16, dtype=np.float32)
    with pytest.raises(ValueError, match="canonical stems"):
        materialize_playable_stem_artifact_set(
            stem_arrays=stem_arrays,
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )


@pytest.mark.parametrize(
    ("invalid_stem_array", "expected_message"),
    [
        (np.zeros((2, 8), dtype=np.float32), "one-dimensional"),
        (np.array([], dtype=np.float32), "non-empty"),
        (np.arange(16, dtype=np.int16), "floating-point"),
        (np.array([0.0, np.nan] + [0.0] * 14, dtype=np.float32), "finite"),
        (np.array([0.0, np.inf] + [0.0] * 14, dtype=np.float32), "finite"),
    ],
)
def test_materializer_rejects_malformed_stem_arrays(
    tmp_path: Path,
    invalid_stem_array: np.ndarray,
    expected_message: str,
) -> None:
    """Malformed model output never reaches WAV encoding or native registration."""
    stem_arrays = sample_stem_arrays()
    stem_arrays["vocals"] = invalid_stem_array
    with pytest.raises(ValueError, match=expected_message):
        materialize_playable_stem_artifact_set(
            stem_arrays=stem_arrays,
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )


def test_materializer_rejects_unaligned_stem_lengths(tmp_path: Path) -> None:
    """Sources with unequal sample counts cannot be represented as synchronized stems."""
    stem_arrays = sample_stem_arrays()
    stem_arrays["drums"] = np.zeros(15, dtype=np.float32)
    with pytest.raises(ValueError, match="aligned"):
        materialize_playable_stem_artifact_set(
            stem_arrays=stem_arrays,
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )


def test_materializer_rejects_non_directory_artifact_root(tmp_path: Path) -> None:
    """A caller cannot redirect artifact publication through a regular file."""
    artifact_root = tmp_path / "artifact-root"
    artifact_root.write_text("not a directory", encoding="utf-8")
    with pytest.raises(ValueError, match="artifact root"):
        materialize_playable_stem_artifact_set(
            stem_arrays=sample_stem_arrays(),
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=artifact_root,
            artifact_set_id=ARTIFACT_SET_ID,
        )


@pytest.mark.skipif(not hasattr(os, "symlink"), reason="symbolic links are unavailable")
def test_materializer_rejects_symbolic_link_artifact_root(tmp_path: Path) -> None:
    """An app-owned artifact root may not be redirected through a symbolic link."""
    actual_root = tmp_path / "actual-root"
    actual_root.mkdir()
    artifact_root = tmp_path / "artifact-root"
    artifact_root.symlink_to(actual_root, target_is_directory=True)
    with pytest.raises(ValueError, match="artifact root"):
        materialize_playable_stem_artifact_set(
            stem_arrays=sample_stem_arrays(),
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=artifact_root,
            artifact_set_id=ARTIFACT_SET_ID,
        )


def test_materializer_reuses_identical_existing_artifact_set(tmp_path: Path) -> None:
    """Idempotent regeneration reuses identical bytes and leaves no staging directory."""
    first_result = materialize_playable_stem_artifact_set(
        stem_arrays=sample_stem_arrays(),
        sample_rate_hz=SAMPLE_RATE_HZ,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )
    second_result = materialize_playable_stem_artifact_set(
        stem_arrays=sample_stem_arrays(),
        sample_rate_hz=SAMPLE_RATE_HZ,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )

    assert second_result == first_result
    version_directory = tmp_path / "playable-stems-v1"
    assert [child_path.name for child_path in version_directory.iterdir()] == [ARTIFACT_SET_ID]


def test_materializer_rejects_existing_identity_with_different_content(tmp_path: Path) -> None:
    """An artifact-set identity collision never overwrites the previously published bytes."""
    first_result = materialize_playable_stem_artifact_set(
        stem_arrays=sample_stem_arrays(),
        sample_rate_hz=SAMPLE_RATE_HZ,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )
    vocal_path = Path(first_result["stemArtifacts"][0]["nativeFilePath"])
    vocal_path.write_bytes(b"changed")

    with pytest.raises(ValueError, match="identity collision"):
        materialize_playable_stem_artifact_set(
            stem_arrays=sample_stem_arrays(),
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )
    assert vocal_path.read_bytes() == b"changed"
    version_directory = tmp_path / "playable-stems-v1"
    assert [child_path.name for child_path in version_directory.iterdir()] == [ARTIFACT_SET_ID]


def test_materializer_removes_staging_directory_when_publication_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failed atomic directory publication leaves neither partial targets nor temp data."""
    original_replace = os.replace

    def failing_directory_replace(source_path: str | bytes, target_path: str | bytes) -> None:
        """Fail only the final artifact-directory publication operation."""
        source_candidate = Path(source_path)
        if source_candidate.is_dir():
            raise OSError("injected publication failure")
        original_replace(source_path, target_path)

    monkeypatch.setattr(os, "replace", failing_directory_replace)
    with pytest.raises(ValueError, match="publish playable stem artifacts"):
        materialize_playable_stem_artifact_set(
            stem_arrays=sample_stem_arrays(),
            sample_rate_hz=SAMPLE_RATE_HZ,
            artifact_root=tmp_path,
            artifact_set_id=ARTIFACT_SET_ID,
        )

    version_directory = tmp_path / "playable-stems-v1"
    assert list(version_directory.iterdir()) == []
