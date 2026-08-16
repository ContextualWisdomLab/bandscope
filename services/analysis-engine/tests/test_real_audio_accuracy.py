"""Real-audio harmony acceptance tests for decoded PCM fixtures."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.accuracy.harmony import (
    AccuracyChecksumError,
    AccuracyIdentityError,
    AccuracyManifestError,
    _chord_symbols_match,
    _decode_acceptance_pcm,
    _section_main_chord,
    evaluate_harmony_fixture,
    parse_fixture_record,
    write_c_major_triad_wav,
)
from bandscope_analysis.separation.audio_separator import AudioSeparationConfig, AudioStemSeparator


def test_c_major_wav_decode_reports_expected_section_chord(tmp_path: Path) -> None:
    """Decode a C-major triad WAV and require the section main chord to be C."""
    audio_path = tmp_path / "c_major_triad.wav"
    digest = write_c_major_triad_wav(audio_path)
    manifest = evaluate_harmony_fixture(
        audio_path,
        {
            "fixture_id": "c_major_triad",
            "audio_file_name": "c_major_triad.wav",
            "audio_sha256": digest,
            "sample_rate": 44100,
            "duration_seconds": 3.0,
            "expected_dominant_chord": "C",
        },
    )

    assert manifest["within_tolerance"] is True
    assert manifest["observed_dominant_chord"] in {"C", "C:maj"}
    assert manifest["recall_score"] == 1.0
    assert manifest["audio_file_name"] == "c_major_triad.wav"
    assert manifest["audio_sha256"] == digest
    assert "/" not in manifest["audio_file_name"]
    assert manifest["metric_name"] == "segment_duration_weighted_chord_symbol_recall"


def test_harmony_fixture_rejects_checksum_mismatch(tmp_path: Path) -> None:
    """Refuse to score a fixture whose bytes no longer match the registered hash."""
    audio_path = tmp_path / "c_major_triad.wav"
    write_c_major_triad_wav(audio_path)
    audio_path.write_bytes(audio_path.read_bytes() + b"\x00")

    with pytest.raises(AccuracyChecksumError, match="audio_sha256"):
        evaluate_harmony_fixture(
            audio_path,
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "0" * 64,
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            },
        )


def test_harmony_fixture_rejects_basename_mismatch(tmp_path: Path) -> None:
    """Refuse to score when the file name no longer matches the registered identity."""
    audio_path = tmp_path / "c_major_triad.wav"
    digest = write_c_major_triad_wav(audio_path)

    with pytest.raises(AccuracyIdentityError, match="audio_file_name"):
        evaluate_harmony_fixture(
            audio_path,
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "other_triad.wav",
                "audio_sha256": digest,
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            },
        )


@pytest.mark.parametrize(
    ("payload", "match"),
    [
        (None, "fixture_record"),
        ({}, "fixture_id"),
        (
            {
                "fixture_id": "",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            },
            "fixture_id",
        ),
        (
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "not-a-digest",
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            },
            "audio_sha256",
        ),
        (
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 0,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            },
            "sample_rate",
        ),
        (
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": True,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            },
            "sample_rate",
        ),
        (
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 44100,
                "duration_seconds": 0,
                "expected_dominant_chord": "C",
            },
            "duration_seconds",
        ),
        (
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 44100,
                "duration_seconds": True,
                "expected_dominant_chord": "C",
            },
            "duration_seconds",
        ),
        (
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "",
            },
            "expected_dominant_chord",
        ),
    ],
)
def test_parse_fixture_record_fails_closed(payload: object, match: str) -> None:
    """Reject incomplete or mistyped fixture records before any decode."""
    with pytest.raises(AccuracyManifestError, match=match):
        parse_fixture_record(payload)


def test_parse_fixture_record_rejects_pathful_file_name() -> None:
    """Keep registered audio names as basenames so manifests never store paths."""
    with pytest.raises(AccuracyManifestError, match="audio_file_name"):
        parse_fixture_record(
            {
                "fixture_id": "c_major_triad",
                "audio_file_name": "nested/c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            }
        )


def test_parse_fixture_record_rejects_non_string_identifier() -> None:
    """Reject a non-string fixture identifier before decode."""
    with pytest.raises(AccuracyManifestError, match="fixture_id"):
        parse_fixture_record(
            {
                "fixture_id": 1,
                "audio_file_name": "c_major_triad.wav",
                "audio_sha256": "a" * 64,
                "sample_rate": 44100,
                "duration_seconds": 3.0,
                "expected_dominant_chord": "C",
            }
        )


def test_empty_recognition_is_scored_as_miss(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A decoded fixture with no chords must not claim the expected triad."""
    audio_path = tmp_path / "c_major_triad.wav"
    digest = write_c_major_triad_wav(audio_path)
    monkeypatch.setattr(
        "bandscope_analysis.accuracy.harmony.ChordRecognizer.recognize",
        lambda self, y, sr=44100: [],
    )
    manifest = evaluate_harmony_fixture(
        audio_path,
        {
            "fixture_id": "c_major_triad",
            "audio_file_name": "c_major_triad.wav",
            "audio_sha256": digest,
            "sample_rate": 44100,
            "duration_seconds": 3.0,
            "expected_dominant_chord": "C",
        },
    )
    assert manifest["within_tolerance"] is False
    assert manifest["observed_dominant_chord"] == "N"
    assert manifest["recall_score"] == 0.0


def test_section_main_chord_uses_n_for_empty_window() -> None:
    """An empty section window is reported as no-chord, not a guessed triad."""
    assert _section_main_chord([], 0.0) == "N"
    assert _section_main_chord([], 1.0) == "N"


def test_c_major_alias_matches_registered_c() -> None:
    """Accept the explicit major alias used by some recognizer labels."""
    assert _chord_symbols_match("C", "C") is True
    assert _chord_symbols_match("C:maj", "C") is True
    assert _chord_symbols_match("G", "C") is False


def test_empty_decode_is_scored_as_miss(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A zero-length decode must not invent a passing triad score."""
    audio_path = tmp_path / "c_major_triad.wav"
    digest = write_c_major_triad_wav(audio_path)
    monkeypatch.setattr(
        "bandscope_analysis.accuracy.harmony._decode_acceptance_pcm",
        lambda path: (np.array([], dtype=np.float32), 0),
    )
    manifest = evaluate_harmony_fixture(
        audio_path,
        {
            "fixture_id": "c_major_triad",
            "audio_file_name": "c_major_triad.wav",
            "audio_sha256": digest,
            "sample_rate": 44100,
            "duration_seconds": 3.0,
            "expected_dominant_chord": "C",
        },
    )
    assert manifest["within_tolerance"] is False
    assert manifest["observed_dominant_chord"] == "N"


def test_decode_trims_to_configured_duration(tmp_path: Path) -> None:
    """Keep fixture decode inside the same duration cap as stem intake."""
    audio_path = tmp_path / "c_major_triad.wav"
    write_c_major_triad_wav(audio_path)
    loader = AudioStemSeparator(AudioSeparationConfig(max_duration_seconds=0.05))
    decoded, sample_rate = _decode_acceptance_pcm(audio_path, separator=loader)
    assert decoded.size <= int(0.05 * sample_rate)


def test_decode_rejects_oversize_fixture(tmp_path: Path) -> None:
    """Fail closed when the WAV exceeds the stem-intake byte cap."""
    audio_path = tmp_path / "c_major_triad.wav"
    write_c_major_triad_wav(audio_path)
    loader = AudioStemSeparator(AudioSeparationConfig(max_file_bytes=1))
    with pytest.raises(ValueError, match="too large"):
        _decode_acceptance_pcm(audio_path, separator=loader)


def test_section_main_chord_handles_empty_summaries(monkeypatch: pytest.MonkeyPatch) -> None:
    """If section summarization returns nothing, report no-chord."""
    monkeypatch.setattr(
        "bandscope_analysis.accuracy.harmony.summarize_section_harmony",
        lambda segments, boundaries: [],
    )
    assert _section_main_chord([], 1.0) == "N"
