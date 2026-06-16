"""Tests for SSM/novelty-curve structural segmentation."""

import numpy as np

from bandscope_analysis.sections.segmenter import (
    assign_section_labels,
    compute_novelty_curve,
    detect_boundaries,
    segment_audio,
    segment_boundaries_from_audio,
)


def _generate_multi_section_audio(sr: int = 22050, duration: float = 30.0) -> np.ndarray:
    """Generate synthetic audio with distinct frequency sections.

    Creates a signal that changes character at known boundaries to test
    segmentation detection.
    """
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, dtype=np.float32)

    # Section 1: 0-10s low frequency (simulating a verse)
    section1 = np.sin(2 * np.pi * 220 * t[:int(sr * 10)]).astype(np.float32)

    # Section 2: 10-20s higher frequency + harmonics (simulating a chorus)
    t2 = t[int(sr * 10):int(sr * 20)]
    section2 = (
        np.sin(2 * np.pi * 440 * t2) + 0.5 * np.sin(2 * np.pi * 880 * t2)
    ).astype(np.float32)

    # Section 3: 20-30s different character (simulating a bridge)
    t3 = t[int(sr * 20):]
    section3 = (
        np.sin(2 * np.pi * 330 * t3) + 0.3 * np.sin(2 * np.pi * 660 * t3)
    ).astype(np.float32)

    audio = np.concatenate([section1, section2, section3])
    return audio[:n_samples]


def test_compute_novelty_curve_returns_valid_shape() -> None:
    """Ensure novelty curve has same length as frame times."""
    sr = 22050
    audio = np.random.randn(sr * 10).astype(np.float32)

    novelty, frame_times = compute_novelty_curve(audio, sr)

    assert len(novelty) == len(frame_times)
    assert len(novelty) > 0
    assert frame_times[0] >= 0.0


def test_detect_boundaries_always_starts_at_zero() -> None:
    """Ensure boundaries always include 0.0 as the first boundary."""
    novelty = np.array([0.0, 0.1, 0.8, 0.2, 0.9, 0.1, 0.0], dtype=np.float64)
    frame_times = np.array([0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0], dtype=np.float64)

    boundaries = detect_boundaries(novelty, frame_times, 30.0)

    assert boundaries[0] == 0.0
    assert all(b >= 0.0 for b in boundaries)


def test_detect_boundaries_respects_min_segment_duration() -> None:
    """Ensure boundaries are at least min_segment_seconds apart."""
    novelty = np.array([0.0, 0.9, 0.9, 0.9, 0.9, 0.0], dtype=np.float64)
    frame_times = np.array([0.0, 1.0, 2.0, 3.0, 4.0, 5.0], dtype=np.float64)

    boundaries = detect_boundaries(novelty, frame_times, 5.0, min_segment_seconds=4.0)

    # With min_segment = 4s and total duration 5s, should only have boundary at 0
    assert boundaries[0] == 0.0
    # Adjacent boundaries should be >= 4s apart
    for i in range(1, len(boundaries)):
        assert boundaries[i] - boundaries[i - 1] >= 4.0


def test_assign_section_labels_first_short_segment_is_intro() -> None:
    """Ensure a short first segment gets labeled as intro."""
    # First segment is 5% of total (short -> intro)
    boundaries = [0.0, 5.0, 50.0, 80.0]
    duration = 100.0

    labels = assign_section_labels(boundaries, duration)

    assert labels[0][0] == "intro"


def test_assign_section_labels_last_segment_is_outro() -> None:
    """Ensure a late-positioned last segment gets labeled as outro."""
    boundaries = [0.0, 20.0, 50.0, 90.0]
    duration = 100.0

    labels = assign_section_labels(boundaries, duration)

    assert labels[-1][0] == "outro"


def test_segment_audio_short_audio_returns_single_section() -> None:
    """Ensure very short audio returns a single fallback section."""
    sr = 22050
    audio = np.random.randn(sr * 2).astype(np.float32)  # 2 seconds

    sections = segment_audio(audio, sr)

    assert len(sections) == 1
    assert sections[0]["id"] == "verse-1"
    assert sections[0]["confidence_level"] == "low"
    assert "too short" in sections[0]["confidence_notes"]


def test_segment_audio_empty_returns_empty() -> None:
    """Ensure empty audio returns empty section list."""
    audio = np.array([], dtype=np.float32)

    sections = segment_audio(audio, 22050)

    assert sections == []


def test_segment_audio_multi_section_returns_candidates() -> None:
    """Ensure multi-section audio produces section candidates with valid structure."""
    audio = _generate_multi_section_audio(sr=22050, duration=30.0)

    sections = segment_audio(audio, 22050, duration=30.0)

    # Should detect at least 1 section
    assert len(sections) >= 1

    # Verify section candidate structure
    for section in sections:
        assert "id" in section
        assert "form_label" in section
        assert "sequence_index" in section
        assert "groove" in section
        assert "confidence_level" in section
        assert "confidence_source" in section
        assert "confidence_notes" in section
        assert "cue_anchor" in section
        assert section["confidence_source"] == "model"


def test_segment_boundaries_from_audio_returns_time_pairs() -> None:
    """Ensure boundary detection returns valid (start, end) tuples."""
    audio = _generate_multi_section_audio(sr=22050, duration=30.0)

    boundaries = segment_boundaries_from_audio(audio, 22050, duration=30.0)

    assert len(boundaries) >= 1
    # All boundaries are tuples of (start, end) with start < end
    for start, end in boundaries:
        assert start < end
        assert start >= 0.0

    # First boundary starts at 0
    assert boundaries[0][0] == 0.0

    # Last boundary ends at approximately duration
    assert boundaries[-1][1] <= 30.0 + 1.0


def test_segment_boundaries_empty_audio_returns_empty() -> None:
    """Ensure empty audio returns empty boundaries list."""
    audio = np.array([], dtype=np.float32)

    boundaries = segment_boundaries_from_audio(audio, 22050)

    assert boundaries == []


def test_segment_boundaries_short_audio_returns_single_pair() -> None:
    """Ensure short audio returns single boundary covering full duration."""
    sr = 22050
    audio = np.random.randn(sr * 3).astype(np.float32)  # 3 seconds

    boundaries = segment_boundaries_from_audio(audio, sr)

    assert len(boundaries) == 1
    assert boundaries[0][0] == 0.0
    assert abs(boundaries[0][1] - 3.0) < 0.1
