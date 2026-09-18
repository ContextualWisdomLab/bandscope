"""Tests for local real-audio corpus admission into the MIR experiment lane."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from types import ModuleType

import pytest
from conftest import load_module, make_symlink_or_skip


def _admission() -> ModuleType:
    return load_module(
        "scripts/research/verify_structure_corpus.py",
        "verify_structure_corpus",
    )


def _registration(audio_hashes: list[str], annotation_hashes: list[str]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "experiment_id": "structure-chroma-stft-vs-cqt-v1",
        "hypothesis": {
            "baseline_feature": "chroma_cqt",
            "candidate_feature": "chroma_stft",
        },
        "metrics": {
            "boundary_f_0_5": {
                "implementation": "mir_eval.segment.detection",
                "window_seconds": 0.5,
                "noninferiority_margin": 0.02,
            },
            "boundary_f_3_0": {
                "implementation": "mir_eval.segment.detection",
                "window_seconds": 3.0,
                "noninferiority_margin": 0.02,
            },
            "functional_label_accuracy": {
                "implementation": (
                    "ismir-mirex/mirex-evaluation@"
                    "b9fa0b0b32e2145af31f35830f78fc9d09a4301b:"
                    "music_structure_analysis.eval_script.calculate_accuracy"
                ),
                "frame_size_seconds": 0.2,
                "frame_grid_contract_version": 1.0,
                "annotation_contract_version": 1.0,
                "label_mapping_contract_version": 1.0,
                "noninferiority_margin": 0.02,
            },
            "repetition_pairwise_f": {
                "implementation": "mir_eval.segment.pairwise",
                "frame_size_seconds": 0.1,
                "noninferiority_margin": 0.02,
            },
            "p95_latency_ratio": {"maximum_candidate_ratio": 0.8},
        },
        "uncertainty": {
            "procedure_id": "paired-track-bootstrap-v1",
            "confidence_level": 0.95,
            "resamples": 1000,
            "random_seed": 7,
        },
        "corpus": [
            {
                "track_id": "track-001",
                "audio_sha256": audio_hashes[0],
                "annotation_sha256": annotation_hashes[0],
                "rights_basis": "unit-test fixture only",
                "rights_cleared": True,
                "source_uri": "urn:bandscope:test:track-001",
            },
            {
                "track_id": "track-002",
                "audio_sha256": audio_hashes[1],
                "annotation_sha256": annotation_hashes[1],
                "rights_basis": "unit-test fixture only",
                "rights_cleared": True,
                "source_uri": "urn:bandscope:test:track-002",
            },
        ],
        "runtime": {
            "source_commit": "e" * 40,
            "uv_lock_sha256": "f" * 64,
            "python_version": "3.12.11",
            "librosa_version": "0.11.0",
            "numpy_version": "2.3.3",
            "sample_rate_hz": 44100,
            "channels": 1,
            "host_profile": "unit-test-host",
        },
        "claim_boundary": "Unit-test fixture only; not production scientific evidence.",
    }


def _runtime() -> dict[str, object]:
    return {
        "source_commit": "e" * 40,
        "uv_lock_sha256": "f" * 64,
        "python_version": "3.12.11",
        "librosa_version": "0.11.0",
        "numpy_version": "2.3.3",
    }


def _files(tmp_path: Path) -> tuple[list[Path], list[Path]]:
    audio_paths = [tmp_path / "one.wav", tmp_path / "two.wav"]
    annotation_paths = [tmp_path / "one.lab", tmp_path / "two.lab"]
    audio_paths[0].write_bytes(b"unit-audio-one")
    audio_paths[1].write_bytes(b"unit-audio-two")
    annotation_paths[0].write_bytes(b"0.0\tverse\n")
    annotation_paths[1].write_bytes(b"0.0\tchorus\n")
    return audio_paths, annotation_paths


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _manifest(
    admission: ModuleType,
    registration: dict[str, object],
    audio_paths: list[Path],
    annotation_paths: list[Path],
) -> dict[str, object]:
    validator = admission._load_validator()
    return {
        "schema_version": 1,
        "registration_sha256": validator.registration_digest(registration),
        "tracks": [
            {
                "track_id": "track-001",
                "audio_path": str(audio_paths[0]),
                "annotation_path": str(annotation_paths[0]),
            },
            {
                "track_id": "track-002",
                "audio_path": str(audio_paths[1]),
                "annotation_path": str(annotation_paths[1]),
            },
        ],
    }


def test_admission_hashes_actual_files_and_emits_no_local_paths(tmp_path: Path) -> None:
    """Receipt binds actual corpus bytes without persisting workstation paths."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
    decoded_digests: list[str] = []

    def fake_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        pcm = memoryview(bytes([len(decoded_digests), 0, 0, 0]))
        digest = hashlib.sha256(pcm).hexdigest()
        decoded_digests.append(digest)
        return digest, 1, pcm

    receipt = admission.verify_corpus(
        registration,
        manifest,
        runtime_identity=_runtime(),
        decoder=fake_decoder,
    )

    tracks = receipt["tracks"]
    assert isinstance(tracks, list)
    assert [track["track_id"] for track in tracks] == ["track-001", "track-002"]
    assert [track["decoded_pcm_sha256"] for track in tracks] == decoded_digests
    serialized = repr(receipt)
    assert str(tmp_path) not in serialized
    assert "audio_path" not in serialized
    assert "annotation_path" not in serialized


def test_admission_rejects_byte_drift_before_decode(tmp_path: Path) -> None:
    """Changed registered audio must fail before any decoder executes."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
    audio_paths[0].write_bytes(b"mutated-after-registration")

    with pytest.raises(ValueError, match="audio_path SHA-256"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=_runtime(),
            decoder=lambda _fd, _sr: pytest.fail("decoder must not run on hash mismatch"),
        )


def test_admission_rejects_runtime_drift(tmp_path: Path) -> None:
    """Runtime drift must fail before corpus measurement begins."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
    runtime = _runtime()
    runtime["numpy_version"] = "9.9.9"

    with pytest.raises(ValueError, match="runtime identity mismatch for numpy_version"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=runtime,
            decoder=lambda _fd, _sr: ("0" * 64, 1),
        )


def test_admission_rejects_symlinked_corpus_material(tmp_path: Path) -> None:
    """Corpus material must not cross the admission boundary through a symlink."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    link = tmp_path / "linked.wav"
    make_symlink_or_skip(link, audio_paths[0])
    manifest = _manifest(admission, registration, [link, audio_paths[1]], annotation_paths)

    with pytest.raises(ValueError, match="audio_path"):
        admission.verify_corpus(
            registration,
            manifest,
            runtime_identity=_runtime(),
            decoder=lambda _fd, _sr: ("0" * 64, 1),
        )


def test_manifest_loader_rejects_duplicate_keys_and_nonstandard_numbers(tmp_path: Path) -> None:
    """Manifest JSON must reject ambiguous keys and non-finite numeric constants."""
    admission = _admission()
    duplicate = tmp_path / "duplicate.json"
    duplicate.write_text('{"schema_version":1,"schema_version":1}', encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate JSON key"):
        admission._load_json(duplicate)

    nonstandard = tmp_path / "nan.json"
    nonstandard.write_text('{"schema_version":NaN}', encoding="utf-8")
    with pytest.raises(ValueError, match="non-standard JSON number"):
        admission._load_json(nonstandard)


def test_admission_hands_exact_pcm_and_annotation_snapshot_to_consumer(tmp_path: Path) -> None:
    """A runner must consume admitted signal/annotation bytes, not reopen source paths."""
    admission = _admission()
    audio_paths, annotation_paths = _files(tmp_path)
    original_annotations = [path.read_bytes() for path in annotation_paths]
    registration = _registration(
        [_digest(path) for path in audio_paths],
        [_digest(path) for path in annotation_paths],
    )
    manifest = _manifest(admission, registration, audio_paths, annotation_paths)
    pcm_payloads = [memoryview(b"\x00\x00\x00\x00"), memoryview(b"\x00\x00\x80?")]
    decoded_index = 0
    consumed: list[tuple[str, bytes, bytes, int]] = []

    def fake_decoder(fd: int, sample_rate_hz: int) -> tuple[str, int, memoryview]:
        nonlocal decoded_index
        assert sample_rate_hz == 44100
        assert os.read(fd, 1)
        pcm = pcm_payloads[decoded_index]
        decoded_index += 1
        return hashlib.sha256(pcm).hexdigest(), 1, pcm

    def consume_track(
        track_id: str,
        pcm: memoryview,
        annotation_bytes: memoryview,
        sample_rate_hz: int,
    ) -> None:
        index = int(track_id[-1]) - 1
        annotation_paths[index].write_bytes(b"mutated-after-admission")
        assert annotation_bytes.readonly
        consumed.append(
            (track_id, bytes(pcm), bytes(annotation_bytes), sample_rate_hz)
        )

    receipt = admission.verify_corpus(
        registration,
        manifest,
        runtime_identity=_runtime(),
        decoder=fake_decoder,
        track_consumer=consume_track,
    )

    assert consumed == [
        ("track-001", bytes(pcm_payloads[0]), original_annotations[0], 44100),
        ("track-002", bytes(pcm_payloads[1]), original_annotations[1], 44100),
    ]
    assert [
        track["decoded_pcm_sha256"] for track in receipt["tracks"]
    ] == [hashlib.sha256(payload).hexdigest() for payload in pcm_payloads]
