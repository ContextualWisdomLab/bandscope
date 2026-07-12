"""Tests for SSM/novelty-curve structural segmentation."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.sections.segmenter import (
    MAX_SSM_FRAMES,
    _checkerboard_novelty,
    _segment_repetition_groups,
    assign_section_labels,
    compute_novelty_curve,
    detect_boundaries,
    segment_audio,
    segment_boundaries_from_audio,
    segment_with_boundaries,
)


def _generate_multi_section_audio(sr: int = 22050, duration: float = 30.0) -> np.ndarray:
    """Generate synthetic audio with distinct frequency sections.

    Creates a signal that changes character at known boundaries to test
    segmentation detection.
    """
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, dtype=np.float32)

    # Section 1: 0-10s low frequency (simulating a verse)
    section1 = np.sin(2 * np.pi * 220 * t[: int(sr * 10)]).astype(np.float32)

    # Section 2: 10-20s higher frequency + harmonics (simulating a chorus)
    t2 = t[int(sr * 10) : int(sr * 20)]
    section2 = (np.sin(2 * np.pi * 440 * t2) + 0.5 * np.sin(2 * np.pi * 880 * t2)).astype(
        np.float32
    )

    # Section 3: 20-30s different character (simulating a bridge)
    t3 = t[int(sr * 20) :]
    section3 = (np.sin(2 * np.pi * 330 * t3) + 0.3 * np.sin(2 * np.pi * 660 * t3)).astype(
        np.float32
    )

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


def test_compute_novelty_curve_increases_hop_for_long_inputs() -> None:
    """Ensure dense SSM frame counts are bounded for long audio."""
    audio = np.ones(MAX_SSM_FRAMES * 512 + 1, dtype=np.float32)
    chroma = np.ones((12, 8), dtype=np.float32)
    ssm = np.eye(8, dtype=np.float64)
    frame_times = np.arange(8, dtype=np.float64)

    with (
        patch(
            "bandscope_analysis.sections.segmenter.librosa.feature.chroma_cqt", return_value=chroma
        ) as chroma_cqt,
        patch(
            "bandscope_analysis.sections.segmenter.librosa.segment.recurrence_matrix",
            return_value=ssm,
        ),
        patch(
            "bandscope_analysis.sections.segmenter.librosa.frames_to_time",
            return_value=frame_times,
        ) as frames_to_time,
    ):
        novelty, times = compute_novelty_curve(audio, 22050)

    used_hop_length = chroma_cqt.call_args.kwargs["hop_length"]
    assert used_hop_length > 512
    assert frames_to_time.call_args.kwargs["hop_length"] == used_hop_length
    assert len(novelty) == len(times) == 8


def test_detect_boundaries_always_starts_at_zero() -> None:
    """Ensure boundaries always include 0.0 as the first boundary."""
    novelty = np.array([0.0, 0.1, 0.8, 0.2, 0.9, 0.1, 0.0], dtype=np.float64)
    frame_times = np.array([0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0], dtype=np.float64)

    boundaries = detect_boundaries(novelty, frame_times, 30.0)

    assert boundaries[0] == 0.0
    assert all(b >= 0.0 for b in boundaries)


def test_checkerboard_novelty_short_matrix_returns_zeros() -> None:
    """Ensure tiny SSM inputs do not create invalid novelty values."""
    novelty = _checkerboard_novelty(np.ones((2, 2), dtype=np.float64), kernel_size=4)

    assert np.array_equal(novelty, np.zeros(2, dtype=np.float64))


def test_detect_boundaries_short_novelty_returns_start_only() -> None:
    """Ensure too-short novelty curves fail closed to a single start boundary."""
    boundaries = detect_boundaries(
        np.array([0.0, 1.0], dtype=np.float64),
        np.array([0.0, 1.0], dtype=np.float64),
        10.0,
    )

    assert boundaries == [0.0]


def test_detect_boundaries_handles_endpoint_peaks_safely() -> None:
    """Ensure endpoint peaks cannot cause out-of-range reads or duplicate bounds."""
    novelty = np.array([1.0, 0.0, 0.9, 0.0, 1.0], dtype=np.float64)
    frame_times = np.array([0.0, 5.0, 10.0, 15.0, 20.0], dtype=np.float64)

    boundaries = detect_boundaries(novelty, frame_times, 20.0, min_segment_seconds=4.0)

    assert boundaries == [0.0, 10.0]


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


def test_detect_boundaries_limits_max_segments() -> None:
    """Ensure noisy novelty curves cannot produce unbounded segment counts."""
    novelty = np.tile(np.array([0.0, 1.0, 0.0], dtype=np.float64), 30)
    frame_times = np.arange(len(novelty), dtype=np.float64)

    boundaries = detect_boundaries(novelty, frame_times, 100.0, min_segment_seconds=1.0)

    assert len(boundaries) == 20


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


def test_assign_section_labels_handles_empty_and_long_forms() -> None:
    """Ensure label assignment handles empty and repeated long-form boundaries."""
    assert assign_section_labels([], 100.0) == []

    boundaries = [float(i * 10) for i in range(12)]
    labels = assign_section_labels(boundaries, 140.0)

    assert labels[9][0] == "verse"
    assert labels[10][0] == "chorus"


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


def test_segment_audio_falls_back_when_boundary_computation_fails() -> None:
    """Ensure segmentation exceptions produce a safe single-section fallback."""
    audio = np.ones(22050 * 20, dtype=np.float32)

    with patch(
        "bandscope_analysis.sections.segmenter._compute_boundaries",
        side_effect=RuntimeError("bad novelty"),
    ):
        sections = segment_audio(audio, 22050, duration=20.0)

    assert len(sections) == 1
    assert sections[0]["id"] == "verse-1"
    assert "bad novelty" in sections[0]["confidence_notes"]


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


def test_segment_boundaries_falls_back_when_boundary_computation_fails() -> None:
    """Ensure boundary exceptions preserve a full-duration segment."""
    audio = np.ones(22050 * 20, dtype=np.float32)

    with patch(
        "bandscope_analysis.sections.segmenter._compute_boundaries",
        side_effect=RuntimeError("bad boundary"),
    ):
        boundaries = segment_boundaries_from_audio(audio, 22050, duration=20.0)

    assert boundaries == [(0.0, 20.0)]


def test_segment_with_boundaries_uses_single_boundary_computation() -> None:
    """Ensure sections and boundary pairs come from one boundary pass."""
    audio = np.ones(22050 * 20, dtype=np.float32)

    with patch(
        "bandscope_analysis.sections.segmenter._compute_boundaries",
        return_value=[0.0, 10.0],
    ) as compute_boundaries:
        sections, boundaries = segment_with_boundaries(audio, 22050, duration=20.0)

    compute_boundaries.assert_called_once()
    # Constant audio -> the two segments are acoustically identical, so repetition
    # grouping labels them as the same repeated section.
    assert [section["id"] for section in sections] == ["chorus-1", "chorus-2"]
    assert boundaries == [(0.0, 10.0), (10.0, 20.0)]


def test_segment_with_boundaries_handles_empty_short_and_failed_inputs() -> None:
    """Ensure combined segmentation helper preserves fallback behavior."""
    assert segment_with_boundaries(np.array([], dtype=np.float32), 22050) == ([], [])

    short_audio = np.ones(22050 * 3, dtype=np.float32)
    short_sections, short_boundaries = segment_with_boundaries(short_audio, 22050)
    assert short_sections[0]["confidence_notes"] == "Audio too short for structural analysis"
    assert short_boundaries == [(0.0, 3.0)]

    audio = np.ones(22050 * 20, dtype=np.float32)
    with patch(
        "bandscope_analysis.sections.segmenter._compute_boundaries",
        side_effect=RuntimeError("bad combined boundary"),
    ):
        failed_sections, failed_boundaries = segment_with_boundaries(audio, 22050, duration=20.0)

    assert "bad combined boundary" in failed_sections[0]["confidence_notes"]
    assert failed_boundaries == [(0.0, 20.0)]


def test_repetition_groups_detect_repeated_segments() -> None:
    """Acoustically identical segments are grouped; distinct ones are not."""
    sr = 22050
    seg = sr * 5
    t = np.arange(seg) / sr
    a = 0.5 * np.sin(2 * np.pi * 261.63 * t).astype(np.float32)  # C4
    b = 0.5 * np.sin(2 * np.pi * 392.00 * t).astype(np.float32)  # G4
    audio = np.concatenate([a, b, a, b]).astype(np.float32)
    groups = _segment_repetition_groups(audio, sr, [0.0, 5.0, 10.0, 15.0], 20.0)
    assert groups[0] == groups[2]  # both A segments
    assert groups[1] == groups[3]  # both B segments
    assert groups[0] != groups[1]  # A and B are distinct


def test_labels_follow_repetition_not_position() -> None:
    """Repeated segments share a label; the old positional labeler would not.

    Pattern A B A B A: A repeats 3x (chorus), B 2x (verse). Positional labeling
    would have called index 0 'intro' and index 2 'chorus' — inconsistent.
    """
    labels = assign_section_labels(
        [0.0, 5.0, 10.0, 15.0, 20.0], 25.0, repetition_groups=[0, 1, 0, 1, 0]
    )
    names = [label for label, _ in labels]
    assert names[0] == names[2] == names[4] == "chorus"  # most-repeated group
    assert names[1] == names[3] == "verse"
    assert names[0] != names[1]


def test_labels_from_repetition_edges_and_bridge() -> None:
    """Unique segments become intro/outro by position, or bridge in the middle."""
    # groups: seg0 unique(first) -> intro; seg1,3 repeat -> chorus; seg2 unique(mid) -> bridge
    labels = assign_section_labels([0.0, 5.0, 10.0, 19.0], 20.0, repetition_groups=[0, 1, 2, 1])
    names = [label for label, _ in labels]
    assert names == ["intro", "chorus", "bridge", "chorus"]


def test_repetition_groups_empty_boundaries_returns_empty() -> None:
    """No boundaries yields no repetition groups (no chroma is computed)."""
    audio = np.zeros(22050, dtype=np.float32)
    assert _segment_repetition_groups(audio, 22050, [], 1.0) == []


def test_labels_from_repetition_last_unique_segment_is_outro() -> None:
    """A unique, late-positioned final segment is labeled outro via repetition path."""
    # All segments unique: seg0 -> intro, seg1 -> bridge (mid), seg2 -> outro (>0.85).
    labels = assign_section_labels([0.0, 5.0, 18.0], 20.0, repetition_groups=[0, 1, 2])
    names = [label for label, _ in labels]
    assert names == ["intro", "bridge", "outro"]
