"""Tests for the ML role extraction module."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.roles.extractor import RoleExtractor


def test_role_extractor_with_audio_features() -> None:
    """Test for test_role_extractor_with_audio_features."""
    extractor = RoleExtractor()
    sections = [{"id": "intro"}]

    # Mock stems
    vocals_stem = np.zeros(1024)
    bass_stem = np.zeros(1024)
    other_stem = np.zeros(1024)

    audio_features = {
        "stems": {"vocals": vocals_stem, "bass": bass_stem, "other": other_stem},
        "sr": 22050,
    }

    with (
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track") as mock_track,
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize"
        ) as mock_recognize,
    ):
        # Vocals and bass track results
        def side_effect_track(y, sr):
            if y is vocals_stem:
                return {"lowest_note": "A3", "highest_note": "A4", "confidence": "high"}
            elif y is bass_stem:
                return {"lowest_note": "E1", "highest_note": "E2", "confidence": "high"}
            return None

        mock_track.side_effect = side_effect_track

        # Bass and other recognize results
        def side_effect_recognize(y, sr):
            if y is bass_stem:
                return [{"chord": "Emaj", "start": 0.0, "end": 1.0}]
            elif y is other_stem:
                return [{"chord": "Amaj", "start": 0.0, "end": 1.0}]
            return None

        mock_recognize.side_effect = side_effect_recognize

        result = extractor.extract(sections, audio_features)

        intro_topology = result["topologies"][0]
        roles_by_id = {r["id"]: r for r in intro_topology["active_roles"]}

        vocal_role = roles_by_id["lead-vocal"]
        assert vocal_role["range"]["lowestNote"] == "A3"
        assert vocal_role["range"]["highestNote"] == "A4"
        assert vocal_role["harmony"]["chord"] == "Amaj"

        bass_role = roles_by_id["bass-guitar"]
        assert bass_role["range"]["lowestNote"] == "E1"
        assert bass_role["range"]["highestNote"] == "E2"
        assert bass_role["harmony"]["chord"] == "Emaj"
        assert bass_role["confidence"]["level"] == "high"

        keys_right = roles_by_id["keys-right"]
        assert keys_right["harmony"]["chord"] == "Amaj"


def test_role_extractor_with_audio_features_empty_results() -> None:
    """Test for test_role_extractor_with_audio_features_empty_results."""
    extractor = RoleExtractor()
    sections = [{"id": "intro"}]

    # Mock stems
    vocals_stem = np.zeros(1024)
    bass_stem = np.zeros(1024)
    other_stem = np.zeros(1024)

    audio_features = {
        "stems": {"vocals": vocals_stem, "bass": bass_stem, "other": other_stem},
        "sr": 22050,
    }

    with (
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track") as mock_track,
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize"
        ) as mock_recognize,
    ):
        mock_track.return_value = None
        mock_recognize.return_value = []

        result = extractor.extract(sections, audio_features)

        intro_topology = result["topologies"][0]
        roles_by_id = {r["id"]: r for r in intro_topology["active_roles"]}

        vocal_role = roles_by_id["lead-vocal"]
        assert vocal_role["range"]["lowestNote"] == "C4"
        assert vocal_role["range"]["highestNote"] == "C4"
        assert vocal_role["harmony"]["chord"] == "N"
        assert vocal_role["confidence"]["level"] == "low"


def test_role_extractor_with_audio_features_exception() -> None:
    """Test for test_role_extractor_with_audio_features_exception."""
    extractor = RoleExtractor()
    sections = [{"id": "intro"}]

    audio_features = {
        "stems": {
            "vocals": np.zeros(1024),
        },
        "sr": 22050,
    }

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track",
        side_effect=Exception("Test Error"),
    ):
        result = extractor.extract(sections, audio_features)

        intro_topology = result["topologies"][0]
        roles_by_id = {r["id"]: r for r in intro_topology["active_roles"]}

        vocal_role = roles_by_id["lead-vocal"]
        assert vocal_role["range"]["lowestNote"] == "C4"
        assert vocal_role["range"]["highestNote"] == "C4"
        assert vocal_role["harmony"]["chord"] == "N"


def test_role_extractor_harmonic_noise_sets_low_harmony_confidence() -> None:
    """Noise-only harmonic segments should produce low-confidence chord notes."""
    extractor = RoleExtractor()
    sections = [{"id": "intro"}]
    other_stem = np.zeros(1024)

    audio_features = {
        "stems": {"other": other_stem},
        "sr": 22050,
    }

    with patch(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
        return_value=[{"chord": "N", "start_time": 0.0, "end_time": 1.0}],
    ):
        result = extractor.extract(sections, audio_features)

    intro_topology = result["topologies"][0]
    roles_by_id = {r["id"]: r for r in intro_topology["active_roles"]}
    keys_right = roles_by_id["keys-right"]
    assert keys_right["harmony"]["chord"] == "N"
    assert "mostly noise" in keys_right["confidence"]["notes"]


def test_role_extractor_confidence_helpers_cover_branches() -> None:
    """Validate chord/pitch confidence helper branches for deterministic coverage."""
    extractor = RoleExtractor()

    assert extractor._first_recognized_chord(["invalid", {"chord": "N"}, {"chord": "G"}]) == "G"
    assert extractor._first_recognized_chord([]) == "N"

    empty_level, _ = extractor._estimate_chord_confidence([])
    assert empty_level == "low"

    noise_level, noise_notes = extractor._estimate_chord_confidence(
        [{"chord": "N", "start_time": 0.0, "end_time": 0.0}]
    )
    assert noise_level == "low"
    assert "mostly noise" in noise_notes

    high_level, _ = extractor._estimate_chord_confidence(
        [{"chord": "C", "start_time": 0.0, "end_time": 10.0}]
    )
    assert high_level == "high"

    medium_level, _ = extractor._estimate_chord_confidence(
        [
            {"chord": "C", "start_time": 0.0, "end_time": 6.0},
            {"chord": "G", "start_time": 6.0, "end_time": 10.0},
            {"chord": "N", "start_time": 10.0, "end_time": 20.0},
        ]
    )
    assert medium_level == "medium"

    low_level, _ = extractor._estimate_chord_confidence(
        [
            object(),
            {"chord": "C", "start": 0.0, "end": 3.0},
            {"chord": "N", "start": 3.0, "end": 10.0},
        ]
    )
    assert low_level == "low"

    merged_level, merged_notes = extractor._merge_confidence("high", "medium", "test context")
    assert merged_level == "medium"
    assert "pitch=high, harmony=medium" in merged_notes

    assert extractor._normalize_confidence("medium") == "medium"
    assert extractor._normalize_confidence("unexpected") == "low"
    assert extractor._as_float("12.5") == 12.5
    assert extractor._as_float("not-a-number") == 0.0
    assert extractor._as_float(object()) == 0.0
