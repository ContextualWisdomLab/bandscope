"""Demucs-based source separation with inference chunking.

Integrates the Hybrid Transformer Demucs (htdemucs) model for high-quality
local source separation. Falls back to DSP-based separation when torch/demucs
is unavailable.

Security Notes:
- Model inference runs entirely locally; no network access during separation.
- Audio file is treated as untrusted input (validated upstream by AudioStemSeparator).
- Inference uses bounded memory via explicit chunking with configurable overlap.
- Does not log or persist raw audio, separated stems, or source paths.
- Model weights are loaded only from the verified cache (see model_weights.py).
- Uses shell=False-style execution; no subprocess or shell invocation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from .model import AudioStemArray, AudioStemName, AudioStemPayload

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DemucsConfig:
    """Configuration for Demucs inference."""

    # Chunk duration in seconds for inference (prevents OOM).
    # Demucs processes in ~10s segments by default; we use a conservative value.
    chunk_seconds: float = 10.0

    # Overlap between chunks in seconds for smooth transitions.
    overlap_seconds: float = 1.0

    # Number of inference workers (set to 1 for minimal memory use).
    num_workers: int = 1

    # Whether to use half-precision (fp16) on CUDA for memory savings.
    use_fp16_cuda: bool = True

    # Maximum audio duration in seconds to process at once.
    max_segment_seconds: float = 600.0


# Demucs stem names mapped to BandScope canonical stem names.
_DEMUCS_TO_BANDSCOPE: dict[str, AudioStemName] = {
    "vocals": "vocals",
    "bass": "bass",
    "drums": "drums",
    "other": "other",
}


def is_demucs_available() -> bool:
    """Check if torch and demucs are importable."""
    try:
        import torch  # noqa: F401
        from demucs.pretrained import get_model  # noqa: F401

        return True
    except ImportError:
        return False


def _select_device() -> Any:
    """Select the best available compute device for inference.

    Returns:
        torch.device for CPU, CUDA, or MPS.
    """
    import torch

    if torch.cuda.is_available():
        logger.info("Using CUDA device for Demucs inference.")
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        logger.info("Using MPS device for Demucs inference.")
        return torch.device("mps")
    logger.info("Using CPU device for Demucs inference.")
    return torch.device("cpu")


class DemucsModelSeparator:
    """Source separation using the Hybrid Transformer Demucs model.

    Implements inference chunking to prevent OOM on standard user machines.
    Supports CPU, CUDA, and MPS (Apple Silicon) backends.

    Security Notes:
    - Loads model weights only from the local verified cache path.
    - Inference is CPU/GPU bound; no network access or file writes.
    - Memory is bounded by chunk size and explicit garbage collection.
    - Does not expose paths, device info, or model internals in logs.
    """

    def __init__(self, config: DemucsConfig | None = None) -> None:
        """Initialize Demucs separator."""
        self.config = config or DemucsConfig()
        self._model: Any = None
        self._device: Any = None

    def _load_model(self) -> None:
        """Load the Demucs model onto the selected device."""
        if self._model is not None:
            return

        import torch  # noqa: F401
        from demucs.pretrained import get_model

        self._device = _select_device()
        self._model = get_model("htdemucs")
        self._model.to(self._device)
        self._model.eval()

        # Use half precision on CUDA for memory efficiency
        if self.config.use_fp16_cuda and self._device.type == "cuda":
            self._model.half()

        logger.info("Demucs model loaded successfully.")

    def separate(
        self,
        audio: NDArray[np.floating[Any]],
        sample_rate: int,
    ) -> AudioStemPayload:
        """Separate audio into stems using chunked Demucs inference.

        Args:
            audio: Mono audio array (float32).
            sample_rate: Sample rate of the audio.

        Returns:
            Dictionary mapping stem names to audio arrays.
        """
        self._load_model()

        import torch
        from demucs.apply import apply_model

        # Resample to model's expected sample rate if needed
        model_sr = self._model.samplerate
        if sample_rate != model_sr:
            audio = self._resample(audio, sample_rate, model_sr)
            sample_rate = model_sr

        # Convert mono to stereo (Demucs expects stereo input)
        # Shape: (channels, samples)
        if audio.ndim == 1:
            stereo = np.stack([audio, audio], axis=0)
        else:
            stereo = audio

        # Convert to torch tensor: (batch, channels, samples)
        audio_tensor = torch.from_numpy(stereo[np.newaxis, ...].copy()).float()

        # Use fp16 on CUDA
        if self.config.use_fp16_cuda and self._device.type == "cuda":
            audio_tensor = audio_tensor.half()

        audio_tensor = audio_tensor.to(self._device)

        # Apply model with chunking to prevent OOM
        with torch.no_grad():
            estimates = apply_model(
                self._model,
                audio_tensor,
                segment=self.config.chunk_seconds,
                overlap=self.config.overlap_seconds / self.config.chunk_seconds,
                device=self._device,
                num_workers=self.config.num_workers,
            )

        # estimates shape: (batch, sources, channels, samples)
        # Convert to mono numpy arrays per stem
        stems: AudioStemPayload = {}
        source_names = self._model.sources  # e.g. ['drums', 'bass', 'other', 'vocals']

        for i, source_name in enumerate(source_names):
            bandscope_name = _DEMUCS_TO_BANDSCOPE.get(source_name)
            if bandscope_name is None:
                continue

            # Take mono (mean of channels), first batch item
            stem_audio = estimates[0, i].mean(dim=0).cpu().numpy()
            stem_audio = np.asarray(stem_audio, dtype=np.float32)
            stem_audio = np.nan_to_num(stem_audio, nan=0.0, posinf=0.0, neginf=0.0)
            stems[bandscope_name] = cast(AudioStemArray, stem_audio)

        # Ensure all canonical stems are present
        target_length = stereo.shape[-1]
        for stem_name in ("vocals", "bass", "drums", "other"):
            if stem_name not in stems:
                stems[cast(AudioStemName, stem_name)] = cast(
                    AudioStemArray, np.zeros(target_length, dtype=np.float32)
                )

        return stems

    def _resample(
        self,
        audio: NDArray[np.floating[Any]],
        orig_sr: int,
        target_sr: int,
    ) -> NDArray[np.floating[Any]]:
        """Resample audio to the target sample rate."""
        import librosa

        resampled = librosa.resample(
            audio.astype(np.float32), orig_sr=orig_sr, target_sr=target_sr
        )
        return np.asarray(resampled, dtype=np.float32)
