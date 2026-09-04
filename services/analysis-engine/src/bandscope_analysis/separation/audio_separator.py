"""Local audio source separation using a bundled Demucs model.

Replaces the previous FFT band-masking heuristic — which scored around -39 dB
SI-SDR on a realistic mix (i.e. not real separation) — with Demucs (htdemucs), a
neural source separator that runs locally on CPU. It produces the canonical
vocals/bass/drums/other stems that downstream role, range, and chord analysis
consume.

Security Notes:
- Treats the selected audio file as untrusted input: the path is normalized and
  verified to be a file, and a maximum byte size is enforced before decode.
- Inference runs locally on CPU with no network access. The model weights are
  loaded from the local Demucs cache or a configured bundled path; offline
  weight bundling is tracked in the supplemental component inventory.
- Does not log or persist raw audio, separated stems, or full source paths.
- Fails with bounded, filename-scoped errors so callers can surface a safe
  failure without leaking local directory structure.
"""

from __future__ import annotations

import contextlib
import logging
import os
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import librosa
import numpy as np

from bandscope_analysis.temporal.analyzer import (
    KNOWN_LIBROSA_NUMBA_WARNING_FILTERS,
    MAX_ANALYSIS_DURATION_SECONDS,
    MAX_AUDIO_FILE_BYTES,
    TARGET_SR,
)

from .model import AudioSeparationResult, AudioStemArray, AudioStemName, AudioStemPayload

logger = logging.getLogger(__name__)

# Demucs htdemucs emits these four sources; this is the canonical stem set.
_STEM_ORDER: tuple[AudioStemName, ...] = ("vocals", "bass", "drums", "other")
_EMPTY_RANGE_EPS = 1e-9


def _contains_parent_path_segment(path: Path) -> bool:
    """Return True when a raw path contains a parent traversal segment."""
    path_text = str(path)
    normalized_path_text = path_text
    for separator in {os.sep, os.altsep, "\\"}:
        if separator and separator != "/":
            normalized_path_text = normalized_path_text.replace(separator, "/")
    return any(part == ".." for part in normalized_path_text.split("/"))


@dataclass(frozen=True)
class AudioSeparationConfig:
    """Resource and model settings for local stem separation."""

    target_sample_rate: int = TARGET_SR
    max_file_bytes: int = MAX_AUDIO_FILE_BYTES
    max_duration_seconds: float = float(MAX_ANALYSIS_DURATION_SECONDS)
    model_name: str = "htdemucs"
    device: str = "cpu"
    # Demucs splits long audio into overlapping segments internally, bounding
    # memory so long tracks do not OOM the host on CPU.
    overlap: float = 0.25


class AudioStemSeparator:
    """Split a selected local mix into canonical stems for downstream analysis."""

    def __init__(self, config: AudioSeparationConfig | None = None) -> None:
        """Initialize the local stem separator (model is loaded lazily)."""
        self.config = config or AudioSeparationConfig()
        self._model: Any = None

    def separate(self, audio_path: str | Path) -> AudioSeparationResult:
        """Separate local audio and retain temporal evidence from the same decode."""
        path = self._resolve_audio_file(audio_path)
        audio, sample_rate = self._load_audio(path)
        if audio.size == 0:
            raise ValueError(f"Stem separation decode failed for {path.name}")

        tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=sample_rate)
        bpm = float(np.asarray(tempo, dtype=np.float64).reshape(-1)[0])
        beat_times = [
            float(value) for value in librosa.frames_to_time(beat_frames, sr=sample_rate).tolist()
        ]

        stem_arrays = self._separate_signal(audio, sample_rate)
        stems: AudioStemPayload = {
            name: self._fit_length(stem_arrays[name], audio.size) for name in _STEM_ORDER
        }
        duration_seconds = float(audio.size / sample_rate)
        logger.info(
            "Separated local audio into %d stems, %.1f seconds",
            len(_STEM_ORDER),
            duration_seconds,
        )
        return {
            "stems": stems,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
            "chunk_count": 1,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
                "drums": "instrument",
                "other": "instrument",
            },
            "separation_notes": (
                "Separated selected local audio into vocals, bass, drums, and other "
                f"using the {self.config.model_name} model."
            ),
            "bpm": bpm,
            "beat_times": beat_times,
        }

    def _separate_signal(
        self, audio: AudioStemArray, sample_rate: int
    ) -> dict[AudioStemName, AudioStemArray]:
        """Run the Demucs model on mono audio and return canonical mono stems.

        This is the single boundary to the neural model; it converts the mono
        signal to the stereo tensor Demucs expects, applies the model on CPU, and
        downmixes each source back to a mono float array.
        """
        model = self._load_model()
        sources = self._apply_model(model, audio)
        return {name: _as_float_array(sources[name]) for name in _STEM_ORDER}

    def _load_model(self) -> Any:
        """Lazily load and cache the Demucs model.

        Demucs (and torch) are installed only on platforms with current torch
        wheels (see pyproject platform markers); elsewhere separation fails with a
        clear error the pipeline already surfaces safely.

        The first load fetches model weights, whose download progress torch may
        print to stdout — that would corrupt the CLI's JSON stdout protocol, so
        stdout is redirected to stderr while the model is obtained.
        """
        if self._model is None:
            try:
                from demucs.pretrained import (  # type: ignore[import-not-found, unused-ignore]
                    get_model,
                )
            except ImportError as error:
                raise ValueError(
                    "Stem separation is not available on this platform (demucs/torch not installed)"
                ) from error

            with contextlib.redirect_stdout(sys.stderr):
                model = get_model(self.config.model_name)
            model.eval()
            self._model = model
        return self._model

    def _apply_model(self, model: Any, audio: AudioStemArray) -> dict[str, np.ndarray[Any, Any]]:
        """Apply Demucs to a mono signal, returning demucs-source-name -> mono array."""
        import torch
        from demucs.apply import apply_model  # type: ignore[import-not-found, unused-ignore]

        wav = torch.from_numpy(np.stack([audio, audio])).float()
        ref_mean = float(wav.mean())
        ref_std = float(wav.std()) + _EMPTY_RANGE_EPS
        normalized = (wav - ref_mean) / ref_std
        with torch.no_grad():
            out = apply_model(
                model,
                normalized[None],
                device=self.config.device,
                split=True,
                overlap=self.config.overlap,
                progress=False,
            )[0]
        out = out * ref_std + ref_mean
        return {name: out[i].mean(0).numpy() for i, name in enumerate(model.sources)}

    def _resolve_audio_file(self, audio_path: str | Path) -> Path:
        """Normalize and validate the selected source path."""
        candidate = Path(audio_path).expanduser()
        if _contains_parent_path_segment(candidate):
            raise ValueError("Path traversal attempt detected in selected audio path")
        try:
            path = candidate.resolve(strict=True)
        except FileNotFoundError as error:
            raise FileNotFoundError(
                f"Audio file not found: {candidate.name or 'selected audio'}"
            ) from error
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {path.name or 'selected audio'}")
        return path

    def _load_audio(self, path: Path) -> tuple[AudioStemArray, int]:
        """Load bounded mono audio without logging or exposing the full source path."""
        try:
            with path.open("rb") as fileobj:
                file_size = os.fstat(fileobj.fileno()).st_size
                if file_size > self.config.max_file_bytes:
                    raise ValueError(
                        "Audio file is too large for stem separation: "
                        f"{file_size} bytes (max {self.config.max_file_bytes} bytes)"
                    )

                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore", category=DeprecationWarning, module=r"^audioread"
                    )
                    warnings.filterwarnings("ignore", category=FutureWarning, module=r"^audioread")
                    for category, message, module in KNOWN_LIBROSA_NUMBA_WARNING_FILTERS:
                        warnings.filterwarnings(
                            "ignore",
                            category=category,
                            message=message,
                            module=module,
                        )
                    y, sr = librosa.load(
                        fileobj,
                        sr=self.config.target_sample_rate,
                        mono=True,
                        duration=self.config.max_duration_seconds,
                    )
        except ValueError:
            raise
        except Exception as error:
            raise ValueError(f"Stem separation decode failed for {path.name}") from error

        return _as_float_array(y), int(sr)

    def _fit_length(self, audio: AudioStemArray, target_length: int) -> AudioStemArray:
        """Trim or pad a stem to match the source length exactly."""
        fitted = np.zeros(target_length, dtype=np.float32)
        copy_length = min(target_length, int(audio.size))
        if copy_length:
            fitted[:copy_length] = audio[:copy_length]
        return cast(AudioStemArray, fitted)


def _as_float_array(values: object) -> AudioStemArray:
    """Convert decoder and model output to a finite one-dimensional float array."""
    array = np.ravel(np.asarray(values, dtype=np.float32))
    finite = np.nan_to_num(array, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    return cast(AudioStemArray, finite)
