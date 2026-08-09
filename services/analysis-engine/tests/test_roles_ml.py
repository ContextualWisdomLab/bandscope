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
                return {"lowest_note": "A3", "highest_note": "A4"}
            if y is bass_stem:
                return {"lowest_note": "E1", "highest_note": "E2"}
            return None

        mock_track.side_effect = side_effect_track

        # Bass and other recognize results
        def side_effect_recognize(y, sr):
            if y is bass_stem:
                return [{"chord": "Emaj", "start": 0.0, "end": 1.0}]
            if y is other_stem:
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
        assert vocal_role["range"]["lowestNote"] == ""
        assert vocal_role["range"]["highestNote"] == ""
        assert vocal_role["harmony"]["chord"] == ""


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
        assert vocal_role["range"]["lowestNote"] == ""
        assert vocal_role["range"]["highestNote"] == ""
