"""Chord recognizer using librosa's chromagrams."""

from typing import TypedDict

import librosa
import numpy as np


class TrackedChord(TypedDict):
    """Result of chord recognition for a time segment."""

    start_time: float
    end_time: float
    chord: str


class ChordRecognizer:
    """Extracts chords from audio data."""

    def __init__(self) -> None:
        """Initialize the chord recognizer."""
        # Standard major/minor triads templates for 12 pitch classes
        # C, C#, D, D#, E, F, F#, G, G#, A, A#, B
        self.templates = self._build_templates()
        self.chord_labels = self._build_labels()

    def _build_templates(self) -> np.ndarray:
        """Build chromagram templates for 24 major and minor chords."""
        templates = np.zeros((24, 12))
        for i in range(12):
            # Major triad (0, 4, 7)
            templates[i, i] = 1.0
            templates[i, (i + 4) % 12] = 1.0
            templates[i, (i + 7) % 12] = 1.0

            # Minor triad (0, 3, 7)
            templates[i + 12, i] = 1.0
            templates[i + 12, (i + 3) % 12] = 1.0
            templates[i + 12, (i + 7) % 12] = 1.0

        # Normalize templates
        norms = np.linalg.norm(templates, axis=1, keepdims=True)
        templates = np.where(norms > 0, templates / norms, templates)
        return templates

    def _build_labels(self) -> list[str]:
        """Build labels corresponding to the templates."""
        notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        labels = []
        for note in notes:
            labels.append(note)  # Major
        for note in notes:
            labels.append(f"{note}m")  # Minor
        return labels

    def recognize(self, y: np.ndarray, sr: int = 22050) -> list[TrackedChord]:
        """
        Recognize chords in an audio array using chromagrams.

        Args:
            y: Audio time series.
            sr: Sampling rate.

        Returns:
            List of dictionaries containing start_time, end_time, and chord string.
        """
        if len(y) == 0:
            return []

        # Compute harmonic harmonic-percussive separation (optional but helps)
        try:
            y_harmonic, _ = librosa.effects.hpss(y)
        except Exception:
            y_harmonic = y

        # Extract chromagram. CQT is better for harmony, but librosa warns on short clips after
        # recursive downsampling; STFT keeps those clips warning-free and still returns chroma.
        try:
            if len(y_harmonic) <= sr * 2:
                chromagram = librosa.feature.chroma_stft(
                    y=y_harmonic,
                    sr=sr,
                    n_fft=min(2048, len(y_harmonic)),
                    hop_length=512,
                )
            else:
                chromagram = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr)
        except Exception:
            return []

        if chromagram.size == 0:
            return []

        # Optional: apply temporal smoothing to chromagram to reduce noise
        chromagram = librosa.decompose.nn_filter(chromagram, aggregate=np.median, metric="cosine")

        # Calculate RMS energy to detect silence/noise
        try:
            rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
            # Match RMS length to chromagram length
            if len(rms) < chromagram.shape[1]:
                rms = np.pad(rms, (0, chromagram.shape[1] - len(rms)), mode="edge")
            else:
                rms = rms[: chromagram.shape[1]]
        except Exception:
            rms = np.ones(chromagram.shape[1])

        # Compare chromagram frames to templates using dot product
        # chromagram shape: (12, n_frames)
        # templates shape: (24, 12)
        # similarity shape: (24, n_frames)
        similarity = np.dot(self.templates, chromagram)

        # Find the best matching chord template for each frame
        best_matches = np.argmax(similarity, axis=0)

        # Convert frames to time segments
        frames = librosa.frames_to_time(np.arange(chromagram.shape[1] + 1), sr=sr)

        chords: list[TrackedChord] = []
        current_chord = None
        start_frame = 0

        # Pre-compute chromagram variance across all frames for performance
        chroma_vars = np.var(chromagram, axis=0)

        for i, match in enumerate(best_matches):
            chord_label = self.chord_labels[match]

            # Simple threshold for unvoiced/noise (if max similarity is very low)
            max_sim = similarity[match, i]
            rms_val = rms[i] if i < len(rms) else 0.0

            # For noise, the max similarity is usually lower, but to be robust
            # we should check if the chromagram is too flat (e.g. low variance)
            # or if the RMS energy is really low.
            # However, since dot product normalization makes noise match *something*,
            # we can look at the variance of the chromagram frame.
            chroma_var = chroma_vars[i]
            if max_sim < 0.3 or rms_val < 0.01 or chroma_var < 0.02:
                chord_label = "N"

            if current_chord is None:
                current_chord = chord_label
                start_frame = i
            elif chord_label != current_chord:
                # Add previous segment
                chords.append(
                    {
                        "start_time": float(frames[start_frame]),
                        "end_time": float(frames[i]),
                        "chord": current_chord,
                    }
                )
                current_chord = chord_label
                start_frame = i

        # Add final segment
        if current_chord is not None:
            chords.append(
                {
                    "start_time": float(frames[start_frame]),
                    "end_time": float(frames[-1] if len(frames) > 0 else 0.0),
                    "chord": current_chord,
                }
            )

        return chords
