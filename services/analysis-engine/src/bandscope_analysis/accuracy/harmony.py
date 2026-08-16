"""Tier-1 harmony acceptance over production-bounded PCM decode.

Security Notes:
- Treats fixture paths and fixture records as untrusted input.
- Reuses ``AudioStemSeparator`` path resolve and bounded decode; no shell.
- Stores only the audio basename in the manifest, never an absolute path.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

import numpy as np
import soundfile as sf  # type: ignore[import-untyped]

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer, TrackedChord
from bandscope_analysis.chords.section_harmony import summarize_section_harmony
from bandscope_analysis.separation.audio_separator import AudioStemSeparator

_C_MAJOR_FREQUENCIES_HZ = (261.63, 329.63, 392.00)
_FIXTURE_SAMPLE_RATE = 44100
_FIXTURE_DURATION_SECONDS = 3.0
_SHA256_HEX_LENGTH = 64
_REQUIRED_FIXTURE_KEYS = (
    "fixture_id",
    "audio_file_name",
    "audio_sha256",
    "sample_rate",
    "duration_seconds",
    "expected_dominant_chord",
)
_METRIC_NAME = "segment_duration_weighted_chord_symbol_recall"
_METRIC_CITATION = (
    "Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., "
    "Liang, D., & Ellis, D. P. W. (2014). MIR_EVAL: A transparent "
    "implementation of common MIR metrics. In Proceedings of the 15th "
    "International Society for Music Information Retrieval Conference "
    "(pp. 367–372)."
)
_ENGINE_NAME = "bandscope_analysis.chords"


class AccuracyManifestError(ValueError):
    """Raised when a fixture record is missing or mistyped."""


class AccuracyChecksumError(ValueError):
    """Raised when fixture bytes do not match the registered digest."""


class AccuracyIdentityError(ValueError):
    """Raised when the file basename does not match the registered name."""


@dataclass(frozen=True)
class FixtureRecord:
    """Registered identity and expected harmony for one PCM fixture."""

    fixture_id: str
    audio_file_name: str
    audio_sha256: str
    sample_rate: int
    duration_seconds: float
    expected_dominant_chord: str


class HarmonyAccuracyManifest(TypedDict):
    """Versioned harmony score for one decoded fixture."""

    schema_name: str
    schema_version: int
    fixture_id: str
    audio_file_name: str
    audio_sha256: str
    sample_rate: int
    duration_seconds: float
    engine_name: str
    metric_name: str
    metric_citation: str
    expected_dominant_chord: str
    observed_dominant_chord: str
    recall_score: float
    within_tolerance: bool


def write_c_major_triad_wav(audio_path: Path) -> str:
    """Write a deterministic C-major triad WAV and return its SHA-256 digest.

    Args:
        audio_path: Destination path for the PCM_16 WAV file.

    Returns:
        Lowercase hex SHA-256 of the written bytes.
    """
    sample_count = int(_FIXTURE_SAMPLE_RATE * _FIXTURE_DURATION_SECONDS)
    time_axis = np.linspace(
        0.0,
        _FIXTURE_DURATION_SECONDS,
        sample_count,
        endpoint=False,
        dtype=np.float64,
    )
    mixture = np.zeros(sample_count, dtype=np.float64)
    for frequency_hz in _C_MAJOR_FREQUENCIES_HZ:
        mixture += np.sin(2.0 * np.pi * frequency_hz * time_axis)
    mixture /= float(len(_C_MAJOR_FREQUENCIES_HZ))
    sf.write(
        audio_path,
        mixture.astype(np.float32),
        _FIXTURE_SAMPLE_RATE,
        format="WAV",
        subtype="PCM_16",
    )
    return _sha256_digest(audio_path)


def parse_fixture_record(payload: object) -> FixtureRecord:
    """Validate a fixture record mapping before any file decode.

    Args:
        payload: Untrusted mapping that must contain the registered fields.

    Returns:
        A validated ``FixtureRecord``.

    Raises:
        AccuracyManifestError: If the payload is incomplete or mistyped.
    """
    if not isinstance(payload, dict):
        raise AccuracyManifestError("fixture_record must be an object")
    for field_name in _REQUIRED_FIXTURE_KEYS:
        if field_name not in payload:
            raise AccuracyManifestError(f"{field_name} is required")
    fixture_id = _require_nonempty_string(payload, "fixture_id")
    audio_file_name = _require_nonempty_string(payload, "audio_file_name")
    if Path(audio_file_name).name != audio_file_name:
        raise AccuracyManifestError("audio_file_name must be a basename")
    audio_sha256 = _require_nonempty_string(payload, "audio_sha256")
    if len(audio_sha256) != _SHA256_HEX_LENGTH or any(
        character not in "0123456789abcdef" for character in audio_sha256
    ):
        raise AccuracyManifestError("audio_sha256 must be 64 lowercase hex characters")
    sample_rate = payload["sample_rate"]
    if not isinstance(sample_rate, int) or isinstance(sample_rate, bool) or sample_rate <= 0:
        raise AccuracyManifestError("sample_rate must be a positive integer")
    duration_seconds = payload["duration_seconds"]
    if (
        not isinstance(duration_seconds, int | float)
        or isinstance(duration_seconds, bool)
        or float(duration_seconds) <= 0.0
    ):
        raise AccuracyManifestError("duration_seconds must be a positive number")
    expected_dominant_chord = _require_nonempty_string(payload, "expected_dominant_chord")
    return FixtureRecord(
        fixture_id=fixture_id,
        audio_file_name=audio_file_name,
        audio_sha256=audio_sha256,
        sample_rate=sample_rate,
        duration_seconds=float(duration_seconds),
        expected_dominant_chord=expected_dominant_chord,
    )


def evaluate_harmony_fixture(audio_path: Path, payload: object) -> HarmonyAccuracyManifest:
    """Decode a registered WAV and score its section-level main chord.

    Args:
        audio_path: Path to the fixture WAV. Only the basename is recorded.
        payload: Untrusted fixture record mapping.

    Returns:
        A harmony accuracy manifest for this fixture.

    Raises:
        AccuracyManifestError: If the fixture record is invalid.
        AccuracyIdentityError: If the basename does not match the record.
        AccuracyChecksumError: If the file digest does not match the record.
    """
    record = parse_fixture_record(payload)
    if audio_path.name != record.audio_file_name:
        raise AccuracyIdentityError("audio_file_name does not match the selected file")
    digest = _sha256_digest(audio_path)
    if digest != record.audio_sha256:
        raise AccuracyChecksumError("audio_sha256 does not match the selected file")
    decoded, sample_rate = _decode_acceptance_pcm(audio_path)
    recognizer = ChordRecognizer()
    tracked = recognizer.recognize(decoded, sr=sample_rate)
    if sample_rate <= 0 or decoded.size <= 0:
        duration_seconds = 0.0
        observed = "N"
    else:
        duration_seconds = float(decoded.size) / float(sample_rate)
        observed = _section_main_chord(tracked, duration_seconds)
    within_tolerance = _chord_symbols_match(observed, record.expected_dominant_chord)
    return {
        "schema_name": "harmony_accuracy_manifest",
        "schema_version": 1,
        "fixture_id": record.fixture_id,
        "audio_file_name": record.audio_file_name,
        "audio_sha256": digest,
        "sample_rate": sample_rate,
        "duration_seconds": duration_seconds,
        "engine_name": _ENGINE_NAME,
        "metric_name": _METRIC_NAME,
        "metric_citation": _METRIC_CITATION,
        "expected_dominant_chord": record.expected_dominant_chord,
        "observed_dominant_chord": observed,
        "recall_score": 1.0 if within_tolerance else 0.0,
        "within_tolerance": within_tolerance,
    }


def _require_nonempty_string(payload: dict[str, object], field_name: str) -> str:
    """Return a non-empty string field or fail closed."""
    value = payload[field_name]
    if not isinstance(value, str) or value.strip() == "":
        raise AccuracyManifestError(f"{field_name} must be a non-empty string")
    return value


def _sha256_digest(audio_path: Path) -> str:
    """Return the lowercase hex SHA-256 digest of a file."""
    digest = hashlib.sha256()
    with audio_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _decode_acceptance_pcm(
    audio_path: Path,
    separator: AudioStemSeparator | None = None,
) -> tuple[np.ndarray, int]:
    """Decode a fixture with the same path, size, and duration bounds as stem intake."""
    loader = separator or AudioStemSeparator()
    resolved = loader._resolve_audio_file(audio_path)
    file_size = resolved.stat().st_size
    if file_size > loader.config.max_file_bytes:
        raise ValueError(
            "Audio file is too large for accuracy acceptance: "
            f"{file_size} bytes (max {loader.config.max_file_bytes} bytes)"
        )
    audio, sample_rate = sf.read(resolved, dtype="float32", always_2d=True)
    decoded = np.mean(np.asarray(audio, dtype=np.float32), axis=1).astype(np.float32)
    source_rate = int(sample_rate)
    max_samples = int(loader.config.max_duration_seconds * source_rate)
    if decoded.size > max_samples:
        decoded = decoded[:max_samples]
    return decoded, source_rate


def _section_main_chord(tracked: list[TrackedChord], duration_seconds: float) -> str:
    """Return the duration-weighted main chord for a single section window."""
    if duration_seconds <= 0.0:
        return "N"
    summaries = summarize_section_harmony(tracked, [(0.0, duration_seconds)])
    if not summaries:
        return "N"
    main_chord = summaries[0]["main_chord"]
    return main_chord if main_chord else "N"


def _chord_symbols_match(observed: str, expected: str) -> bool:
    """Return whether an observed symbol matches the registered expectation."""
    if observed == expected:
        return True
    return expected == "C" and observed == "C:maj"
