"""Chord recognizer using librosa's chromagrams and Viterbi HMM decoding."""

import logging
from typing import TypedDict

import librosa
import librosa.sequence
import numpy as np

logger = logging.getLogger(__name__)


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

    def _build_transition_matrix(self, n_states: int, self_loop_prob: float = 0.9) -> np.ndarray:
        """Build a chord-to-chord transition matrix with high self-loop probability.

        Musical chords tend to sustain for multiple frames, so a high self-loop
        probability captures this tendency while still allowing smooth transitions.

        Args:
            n_states: Number of chord states (e.g. 24 for 12 major + 12 minor).
            self_loop_prob: Probability of staying on the same chord (0 < p < 1).

        Returns:
            Row-normalized transition matrix of shape (n_states, n_states).
        """
        if n_states <= 1:
            return np.ones((max(n_states, 1), max(n_states, 1)))
        other_prob = (1.0 - self_loop_prob) / (n_states - 1)
        transition = np.full((n_states, n_states), other_prob)
        np.fill_diagonal(transition, self_loop_prob)
        return transition

    def _decode_with_viterbi(self, similarity: np.ndarray) -> np.ndarray:
        """Apply Viterbi decoding to produce a smoothed chord sequence.

        Converts the per-frame similarity scores to a probability distribution
        and decodes the most likely chord sequence using a self-loop dominant
        HMM transition model via librosa's Viterbi implementation.

        Args:
            similarity: Shape (n_chords, n_frames) dot-product similarity matrix.

        Returns:
            Integer array of shape (n_frames,) with the chord state index for
            each frame after HMM smoothing.
        """
        # Shift to non-negative values, then normalise each frame to sum to 1.
        obs = similarity - similarity.min(axis=0, keepdims=True)
        col_sums = obs.sum(axis=0, keepdims=True)
        col_sums = np.where(col_sums == 0, 1.0, col_sums)
        obs = obs / col_sums
        # Add a small probability floor so no observation is zero.
        obs = np.maximum(obs, 1e-7)
        obs = obs / obs.sum(axis=0, keepdims=True)

        n_chords = similarity.shape[0]
        transition = self._build_transition_matrix(n_chords)
        try:
            return np.asarray(librosa.sequence.viterbi_discriminative(obs, transition))
        except Exception:
            # Fall back to frame-wise argmax if Viterbi decoding fails.
            logger.warning("Viterbi decoding failed; falling back to argmax")
            return np.asarray(np.argmax(similarity, axis=0))

    def _separate_harmonic(self, y: np.ndarray) -> np.ndarray:
        """Separate harmonic component from audio."""
        try:
            y_harmonic, _ = librosa.effects.hpss(y)
            return np.asarray(y_harmonic)
        except Exception:
            return y

    def _extract_chromagram(self, y_harmonic: np.ndarray, sr: int) -> np.ndarray | None:
        """Extract and smooth chromagram."""
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
            return None

        if chromagram.size == 0:
            return None

        # Optional: apply temporal smoothing to chromagram to reduce noise
        chromagram = librosa.decompose.nn_filter(chromagram, aggregate=np.median, metric="cosine")
        return np.asarray(chromagram)

    def _calculate_rms(self, y: np.ndarray, chromagram_len: int) -> np.ndarray:
        """Calculate RMS energy to detect silence/noise."""
        try:
            rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
            # Match RMS length to chromagram length
            if len(rms) < chromagram_len:
                rms = np.pad(rms, (0, chromagram_len - len(rms)), mode="edge")
            else:
                rms = rms[:chromagram_len]
        except Exception:
            rms = np.ones(chromagram_len)
        return np.asarray(rms)

    def _match_templates(self, chromagram: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Match chromagram to templates and return similarities and best match indices."""
        # Compare chromagram frames to templates using dot product.
        # chromagram shape: (12, n_frames)
        # templates shape: (24, 12)
        # similarity shape: (24, n_frames)
        similarity = np.dot(self.templates, chromagram)
        best_matches = np.argmax(similarity, axis=0)
        return similarity, best_matches

    def _create_chord_segments(
        self,
        chromagram: np.ndarray,
        similarity: np.ndarray,
        best_matches: np.ndarray,
        rms: np.ndarray,
        sr: int,
    ) -> list[TrackedChord]:
        """Convert frame-level chord predictions into time segments."""
        frames = librosa.frames_to_time(np.arange(chromagram.shape[1] + 1), sr=sr)
        chords: list[TrackedChord] = []
        current_chord = None
        start_frame = 0

        # Vectorize the variance calculation over frames
        chroma_vars = np.var(chromagram, axis=0)
        # Use the maximum similarity across *all* chords per frame for the noise
        # threshold.  With Viterbi decoding the assigned chord index may differ
        # from the argmax, so we must not rely on `similarity[match, i]` here.
        max_sims = np.max(similarity, axis=0)

        for i, match in enumerate(best_matches):
            chord_label = self.chord_labels[match]

            # Threshold for unvoiced/noise: if no chord has high similarity,
            # or if RMS energy / chromagram variance are too low, mark as N.
            max_sim = float(max_sims[i])
            rms_val = rms[i] if i < len(rms) else 0.0
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

        y_harmonic = self._separate_harmonic(y)
        chromagram = self._extract_chromagram(y_harmonic, sr)

        if chromagram is None:
            return []

        rms = self._calculate_rms(y, chromagram.shape[1])
        similarity, _ = self._match_templates(chromagram)
        # Apply Viterbi HMM decoding for a musically coherent chord sequence.
        best_matches = self._decode_with_viterbi(similarity)

        return self._create_chord_segments(chromagram, similarity, best_matches, rms, sr)
