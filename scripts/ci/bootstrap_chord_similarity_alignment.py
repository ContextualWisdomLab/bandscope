#!/usr/bin/env python3
"""Align chord-segment confidence reads with padded observation frames, then self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "services/analysis-engine/src/bandscope_analysis/chords/chord_recognizer.py"
TEST = ROOT / "services/analysis-engine/tests/test_chord_recognizer_opt.py"
SELF = ROOT / "scripts/ci/bootstrap_chord_similarity_alignment.py"
SELF_WORKFLOW = ROOT / ".github/workflows/bootstrap-chord-similarity-alignment.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail closed on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_source(text: str) -> str:
    """Use one bounded fallback vector when similarity frames are missing."""
    text = replace_once(
        text,
        """        current_confidence = "low"
        start_frame = 0

        for i in range(n_frames):
""",
        """        current_confidence = "low"
        start_frame = 0
        missing_similarity = np.zeros(self.templates.shape[0], dtype=similarity.dtype)

        for i in range(n_frames):
""",
        "missing similarity fallback",
    )
    text = replace_once(
        text,
        """            # Compute per-frame confidence from the similarity distribution
            frame_confidence = self._compute_confidence(similarity[:, i], state)
""",
        """            # Compute confidence from the matching frame or a bounded neutral
            # fallback when observation construction padded missing similarity.
            frame_similarity = (
                similarity[:, i] if i < similarity.shape[1] else missing_similarity
            )
            frame_confidence = self._compute_confidence(frame_similarity, state)
""",
        "aligned confidence read",
    )
    return text


def patch_test(text: str) -> str:
    """Add end-to-end segment coverage for short similarity matrices."""
    addition = """


def test_create_chord_segments_handles_short_similarity(monkeypatch):
    """Keep confidence generation aligned when observation frames are padded."""
    recognizer = ChordRecognizer()
    chromagram = np.zeros((12, 4))
    similarity = np.zeros((24, 1))
    rms = np.ones(4)
    monkeypatch.setattr(
        recognizer,
        "_viterbi_decode",
        lambda observation_probs: np.zeros(observation_probs.shape[1], dtype=np.intp),
    )

    segments = recognizer._create_chord_segments(chromagram, similarity, rms, 22_050)

    assert len(segments) == 1
    assert segments[0]["chord"] == "C"
    assert segments[0]["confidence"] == "low"
"""
    marker = """    probs = recognizer._build_observation_probs(chromagram, similarity, rms)
    assert probs.shape == (25, 10)
"""
    if addition.strip() in text:
        raise RuntimeError("segment regression already present")
    if not text.endswith(marker):
        raise RuntimeError("observation test tail drifted")
    return text + addition


def main() -> int:
    """Patch reviewed files and remove the one-shot bootstrap artifacts."""
    SOURCE.write_text(patch_source(SOURCE.read_text(encoding="utf-8")), encoding="utf-8")
    TEST.write_text(patch_test(TEST.read_text(encoding="utf-8")), encoding="utf-8")
    SELF.unlink()
    SELF_WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
