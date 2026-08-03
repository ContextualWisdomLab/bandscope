#!/usr/bin/env python3
"""Reuse one neutral chord-similarity fallback vector, then self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "services/analysis-engine/src/bandscope_analysis/chords/chord_recognizer.py"
SELF = ROOT / "scripts/ci/bootstrap_chord_fallback_buffer.py"
WORKFLOW = ROOT / ".github/workflows/bootstrap-chord-fallback-buffer.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace one exact reviewed fragment and fail closed on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    """Apply the allocation fix and remove the one-shot bootstrap artifacts."""
    text = SOURCE.read_text(encoding="utf-8")
    text = replace_once(
        text,
        """        n_sim_frames = similarity.shape[1]
        for i in range(n_frames):
""",
        """        n_sim_frames = similarity.shape[1]
        missing_similarity = np.zeros(similarity.shape[0], dtype=similarity.dtype)
        for i in range(n_frames):
""",
        "fallback allocation",
    )
    text = replace_once(
        text,
        """            sim_frame = similarity[:, i] if i < n_sim_frames else np.zeros(similarity.shape[0])
""",
        """            sim_frame = similarity[:, i] if i < n_sim_frames else missing_similarity
""",
        "fallback reuse",
    )
    SOURCE.write_text(text, encoding="utf-8")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
