#!/usr/bin/env python3
"""Apply the reviewed neutral missing-frame fallback fix, then self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RECOGNIZER = ROOT / "services/analysis-engine/src/bandscope_analysis/chords/chord_recognizer.py"
TESTS = ROOT / "services/analysis-engine/tests/test_chord_recognizer_opt.py"
SELF = ROOT / "scripts/ci/fix_chord_missing_frame_fallback.py"
WORKFLOW = ROOT / ".github/workflows/fix-chord-missing-frame-fallback.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


def main() -> int:
    """Patch the recognizer and add regression coverage."""
    recognizer = RECOGNIZER.read_text(encoding="utf-8")
    recognizer = replace_once(
        recognizer,
        "        # Pad or truncate RMS to match n_frames\n"
        "        rms_vals = rms[:n_frames] if len(rms) >= n_frames else np.pad(rms, (0, n_frames - len(rms)))\n",
        "        # Missing RMS is unknown rather than evidence of silence.\n"
        "        rms_vals = (\n"
        "            rms[:n_frames]\n"
        "            if len(rms) >= n_frames\n"
        "            else np.pad(\n"
        "                rms,\n"
        "                (0, n_frames - len(rms)),\n"
        "                constant_values=1.0,\n"
        "            )\n"
        "        )\n",
        "RMS fallback",
    )
    recognizer = replace_once(
        recognizer,
        "        if n_sim_frames == 0:\n"
        "            max_sims = np.zeros(n_frames)\n",
        "        if n_sim_frames == 0:\n"
        "            max_sims = np.full(n_frames, 1.0)\n",
        "empty similarity fallback",
    )
    recognizer = replace_once(
        recognizer,
        "                max_sims = np.pad(sim_max_raw, (0, n_frames - n_sim_frames))\n",
        "                max_sims = np.pad(\n"
        "                    sim_max_raw,\n"
        "                    (0, n_frames - n_sim_frames),\n"
        "                    constant_values=1.0,\n"
        "                )\n",
        "short similarity fallback",
    )
    RECOGNIZER.write_text(recognizer, encoding="utf-8")

    tests = TESTS.read_text(encoding="utf-8")
    marker = "def test_missing_observation_metadata_does_not_force_no_chord():"
    if marker not in tests:
        tests += (
            "\n\n"
            "def test_missing_observation_metadata_does_not_force_no_chord():\n"
            "    \"\"\"Keep uniform chord fallback neutral when similarity and RMS are absent.\"\"\"\n"
            "    recognizer = ChordRecognizer()\n"
            "    chromagram = np.zeros((12, 3))\n"
            "    chromagram[0, :] = 1.0\n"
            "    similarity = np.zeros((24, 0))\n"
            "    rms = np.array([], dtype=float)\n"
            "\n"
            "    probs = recognizer._build_observation_probs(chromagram, similarity, rms)\n"
            "\n"
            "    assert np.allclose(probs[24], 0.05 / 1.05)\n"
            "    assert np.allclose(probs[:24], 1.0 / (24.0 * 1.05))\n"
        )
    TESTS.write_text(tests, encoding="utf-8")

    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
