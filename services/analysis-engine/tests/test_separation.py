"""Tests for the source separation module."""

import hashlib

import numpy as np
import pytest
import soundfile as sf

from bandscope_analysis.separation.audio_separator import (
    AudioSeparationConfig,
    AudioStemSeparator,
)
from bandscope_analysis.separation.model import StemCategory
from bandscope_analysis.separation.separator import StemSeparator, _categorize_role


def test_stem_category_enum() -> None:
    """Verify StemCategory enum values match the domain requirements."""
    assert StemCategory.VOCALS.value == "vocals"
    assert StemCategory.BASS.value == "bass"
    assert StemCategory.DRUMS.value == "drums"
    assert StemCategory.KEYS.value == "keys"
    assert StemCategory.GUITAR.value == "guitar"
    assert StemCategory.OTHER.value == "other"


def test_categorize_role_vocal() -> None:
    """Test vocal role type is categorized correctly."""
    assert _categorize_role("lead-vocal", "Lead Vocal", "vocal") == StemCategory.VOCALS


def test_categorize_role_bass() -> None:
    """Test bass instrument role is categorized correctly."""
    assert _categorize_role("bass-guitar", "Bass Guitar", "instrument") == StemCategory.BASS


def test_categorize_role_keys() -> None:
    """Test keyboard role is categorized correctly."""
    assert _categorize_role("keys-right", "Keyboard 1 Right Hand", "hand") == StemCategory.KEYS


def test_categorize_role_piano() -> None:
    """Test piano role is categorized correctly."""
    assert _categorize_role("piano-1", "Piano", "instrument") == StemCategory.KEYS


def test_categorize_role_guitar() -> None:
    """Test guitar role is categorized correctly."""
    assert _categorize_role("guitar-1", "Electric Guitar", "instrument") == StemCategory.GUITAR


def test_categorize_role_drums() -> None:
    """Test drum role is categorized correctly."""
    assert _categorize_role("drum-kit", "Drum Kit", "instrument") == StemCategory.DRUMS


def test_categorize_role_other() -> None:
    """Test unknown role type is categorized as other."""
    assert _categorize_role("synth-pad", "Synth Pad", "instrument") == StemCategory.OTHER


def test_stem_separator_empty() -> None:
    """Test separator with empty roles list."""
    separator = StemSeparator()
    result = separator.separate([])
    assert result["stems"] == []
    assert "0 roles" in result["separation_notes"]


def test_stem_separator_basic() -> None:
    """Test separator with typical roles."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "lead-vocal", "name": "Lead Vocal", "roleType": "vocal"},
        {"id": "keys-right", "name": "Keyboard Right Hand", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 3
    stems_by_id = {s["stem_id"]: s for s in result["stems"]}
    assert stems_by_id["stem-bass-guitar"]["category"] == "bass"
    assert stems_by_id["stem-lead-vocal"]["category"] == "vocals"
    assert stems_by_id["stem-keys-right"]["category"] == "keys"


def test_stem_separator_deduplicates() -> None:
    """Test separator deduplicates roles by id."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1


def test_stem_separator_invalid_role() -> None:
    """Test separator handles non-dict roles gracefully."""
    separator = StemSeparator()
    result = separator.separate(  # type: ignore[arg-type]
        [{"id": "bass", "name": "Bass", "roleType": "instrument"}, "invalid"]
    )
    assert len(result["stems"]) == 1


def test_stem_separator_confidence() -> None:
    """Test confidence levels based on role types."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "keys-left", "name": "Keys Left", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    # instrument gets high, hand gets medium
    assert result["stems"][0]["confidence"] == "high"
    assert result["stems"][1]["confidence"] == "medium"


def test_stem_separator_missing_role_fields() -> None:
    """Test separator handles roles with missing fields."""
    separator = StemSeparator()
    roles = [{"id": "unknown-1"}]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1
    assert result["stems"][0]["category"] == "other"
    # When name is missing, label falls back to role id
    assert result["stems"][0]["label"] == "unknown-1"


def test_stem_separator_keyboard_name_match() -> None:
    """Test separator categorizes keyboard by name even without keys in id."""
    separator = StemSeparator()
    roles = [{"id": "synth-1", "name": "Keyboard Part", "roleType": "instrument"}]
    result = separator.separate(roles)
    assert result["stems"][0]["category"] == "keys"


def test_stem_separator_missing_id() -> None:
    """Test separator handles roles with missing id by generating a fallback id."""
    separator = StemSeparator()
    roles = [{"name": "Lead Vocal", "roleType": "vocal"}]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1
    assert result["stems"][0]["stem_id"] == "stem-role-0"
    assert result["stems"][0]["label"] == "Lead Vocal"


def test_audio_stem_separator_splits_local_audio_into_chunked_stems(tmp_path) -> None:
    """Ensure local audio is separated into downstream-consumable canonical stems."""
    sample_rate = 8_000
    duration_seconds = 0.8
    samples = int(sample_rate * duration_seconds)
    times = np.arange(samples, dtype=np.float32) / sample_rate
    click_track = np.zeros(samples, dtype=np.float32)
    click_track[:: sample_rate // 4] = 0.8
    mix = (
        0.35 * np.sin(2 * np.pi * 82.0 * times)
        + 0.25 * np.sin(2 * np.pi * 880.0 * times)
        + click_track
    ).astype(np.float32)
    audio_path = tmp_path / "rehearsal.wav"
    sf.write(audio_path, mix, sample_rate)

    separator = AudioStemSeparator(
        AudioSeparationConfig(
            target_sample_rate=sample_rate,
            chunk_duration_seconds=0.25,
            max_duration_seconds=1.0,
            max_file_bytes=1_000_000,
        )
    )

    result = separator.separate(audio_path)

    assert set(result["stems"]) == {"vocals", "bass", "drums", "other"}
    assert result["sample_rate"] == sample_rate
    assert result["duration_seconds"] == pytest.approx(duration_seconds)
    assert result["chunk_count"] == 4
    assert result["stem_role_types"] == {
        "vocals": "vocal",
        "bass": "instrument",
        "drums": "instrument",
        "other": "instrument",
    }
    assert "4 chunks" in result["separation_notes"]
    assert str(tmp_path) not in result["separation_notes"]
    for stem in result["stems"].values():
        assert stem.shape == (samples,)
        assert np.isfinite(stem).all()
    assert np.any(np.abs(result["stems"]["bass"]) > 0)
    assert np.any(np.abs(result["stems"]["drums"]) > 0)


def test_audio_stem_separator_assigns_boundary_frequency_to_drums_only() -> None:
    """Ensure adjacent vocal and drum bands do not overlap at the boundary."""
    sample_rate = 8_000
    samples = 800
    times = np.arange(samples, dtype=np.float32) / sample_rate
    boundary_tone = np.sin(2 * np.pi * 3_400.0 * times).astype(np.float32)
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=sample_rate))

    stems = separator._separate_chunk(boundary_tone, sample_rate)

    drum_peak = float(np.max(np.abs(stems["drums"])))
    vocal_peak = float(np.max(np.abs(stems["vocals"])))
    assert drum_peak > 0.5
    assert vocal_peak < drum_peak * 0.001


def test_audio_stem_separator_rejects_path_traversal_in_audio_path() -> None:
    """Ensure paths containing traversal components are rejected before resolving."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))
    with pytest.raises(ValueError, match="Path traversal detected"):
        separator.separate("../rehearsal.wav")


def test_audio_stem_separator_rejects_missing_audio_file(tmp_path) -> None:
    """Ensure missing local files fail before decode without leaking a full path."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(FileNotFoundError, match="Audio file not found: missing.wav"):
        separator.separate(tmp_path / "missing.wav")


def test_audio_stem_separator_rejects_directory_source(tmp_path) -> None:
    """Ensure directories are not accepted as audio files."""
    source_dir = tmp_path / "source-dir"
    source_dir.mkdir()
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(FileNotFoundError, match="Audio file not found: source-dir"):
        separator.separate(source_dir)


def test_audio_stem_separator_rejects_oversized_audio_file(tmp_path) -> None:
    """Ensure local audio intake enforces a bounded file-size limit."""
    audio_path = tmp_path / "too-large.wav"
    audio_path.write_bytes(b"0" * 16)
    separator = AudioStemSeparator(
        AudioSeparationConfig(target_sample_rate=8_000, max_file_bytes=8)
    )

    with pytest.raises(ValueError, match="Audio file is too large for stem separation"):
        separator.separate(audio_path)


def test_audio_stem_separator_rejects_empty_decoder_output(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure empty decoder output fails safely."""
    audio_path = tmp_path / "empty.wav"
    audio_path.write_bytes(b"placeholder")
    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.librosa.load",
        lambda *args, **kwargs: (np.array([], dtype=np.float32), 8_000),
    )
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Stem separation decode failed for empty.wav"):
        separator.separate(audio_path)


def test_audio_stem_separator_redacts_decoder_exceptions(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure decoder failures are surfaced without full local paths."""
    audio_path = tmp_path / "broken.wav"
    audio_path.write_bytes(b"placeholder")

    def fail_decode(*args, **kwargs):
        raise RuntimeError(f"decoder failed under {tmp_path}")

    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.librosa.load",
        fail_decode,
    )
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Stem separation decode failed for broken.wav") as error:
        separator.separate(audio_path)

    assert str(tmp_path) not in str(error.value)


def test_audio_stem_separator_rejects_path_traversal_in_model_profile() -> None:
    """Ensure profile paths containing traversal components are rejected."""
    with pytest.raises(ValueError, match="Path traversal detected"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path="../profile.json",
                model_profile_sha256="0" * 64,
            )
        )


def test_audio_stem_separator_uses_verified_local_model_profile(tmp_path) -> None:
    """Ensure local model profile overrides are applied only when checksum is verified."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(
        ('{"bassCutoffHz": 100.0, "vocalLowHz": 120.0, "vocalHighHz": 350.0, "drumLowHz": 350.0}'),
        encoding="utf-8",
    )
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()
    separator = AudioStemSeparator(
        AudioSeparationConfig(
            target_sample_rate=8_000,
            model_profile_path=str(profile_path),
            model_profile_sha256=checksum,
        )
    )
    assert separator._bass_cutoff_hz == pytest.approx(100.0)
    assert separator._drum_low_hz == pytest.approx(350.0)


def test_audio_stem_separator_requires_checksum_for_local_model_profile(tmp_path) -> None:
    """Ensure local model profile paths require explicit checksum pinning."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text("{}", encoding="utf-8")

    with pytest.raises(ValueError, match="model_profile_sha256 is required"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
            )
        )


def test_audio_stem_separator_rejects_model_profile_checksum_mismatch(tmp_path) -> None:
    """Ensure tampered model profiles are rejected by checksum validation."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text("{}", encoding="utf-8")

    with pytest.raises(ValueError, match="SHA256 mismatch"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256="0" * 64,
            )
        )


def test_audio_stem_separator_rejects_invalid_json_model_profile(tmp_path) -> None:
    """Ensure invalid profile JSON fails safely."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text("{invalid", encoding="utf-8")
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="invalid JSON profile"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256=checksum,
            )
        )


def test_audio_stem_separator_rejects_non_object_model_profile(tmp_path) -> None:
    """Ensure well-formed non-object profile JSON fails as verification failure."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text("[]", encoding="utf-8")
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="invalid JSON profile"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256=checksum,
            )
        )


def test_audio_stem_separator_rejects_unreadable_local_model_profile(tmp_path) -> None:
    """Ensure unreadable profile paths fail without leaking local parent paths."""
    profile_path = tmp_path / "profile-dir.json"
    profile_path.mkdir()

    with pytest.raises(ValueError, match="unreadable profile") as error:
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256="0" * 64,
            )
        )
    assert str(tmp_path) not in str(error.value)


def test_audio_stem_separator_rejects_oversized_local_model_profile(tmp_path) -> None:
    """Ensure model profile overrides have a bounded read size."""
    profile_path = tmp_path / "large-profile.json"
    profile_path.write_text(" " * 20_000, encoding="utf-8")
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="profile too large"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256=checksum,
            )
        )


def test_audio_stem_separator_rejects_missing_local_model_profile(tmp_path) -> None:
    """Ensure missing local model profiles fail without leaking parent paths."""
    profile_path = tmp_path / "missing-profile.json"

    with pytest.raises(FileNotFoundError, match="Model profile not found: missing-profile.json"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256="0" * 64,
            )
        )


def test_audio_stem_separator_rejects_non_numeric_band_profile(tmp_path) -> None:
    """Ensure profile numeric coercion failures use bounded verification errors."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(
        '{"bassCutoffHz": "low", "vocalLowHz": 300.0, "vocalHighHz": 350.0, "drumLowHz": 350.0}',
        encoding="utf-8",
    )
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="invalid numeric band value"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256=checksum,
            )
        )


def test_audio_stem_separator_rejects_invalid_band_profile(tmp_path) -> None:
    """Ensure profile band ordering is validated before use."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(
        '{"bassCutoffHz": 400.0, "vocalLowHz": 300.0, "vocalHighHz": 350.0, "drumLowHz": 350.0}',
        encoding="utf-8",
    )
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="invalid band ordering"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256=checksum,
            )
        )


def test_audio_stem_separator_rejects_non_finite_band_profile(tmp_path) -> None:
    """Ensure non-finite profile values are rejected before use."""
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(
        '{"bassCutoffHz": NaN, "vocalLowHz": 300.0, "vocalHighHz": 350.0, "drumLowHz": 350.0}',
        encoding="utf-8",
    )
    checksum = hashlib.sha256(profile_path.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="non-finite band value"):
        AudioStemSeparator(
            AudioSeparationConfig(
                target_sample_rate=8_000,
                model_profile_path=str(profile_path),
                model_profile_sha256=checksum,
            )
        )
