"""Audio source separation using Demucs."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

try:
    from torch import Tensor
except ImportError:  # pragma: no cover
    Tensor = Any  # type: ignore

logger = logging.getLogger(__name__)


class AudioStemSeparator:
    """Isolates standard stems from an audio mix using Demucs.

    Security Notes:
    - Trust boundary: Audio input is passed as raw numpy arrays from a prior decoding step
      (e.g. librosa), reducing the risk of codec-based exploitation within Demucs itself.
    - Limits: Employs chunked inference (split=True) to strictly bound peak memory (OOM avoidance).
    - Network: Downloads model weights securely to local cache on first run. Future executions
      should ideally be offline.
    """

    def __init__(self, model_name: str = "htdemucs") -> None:
        """Initialize the audio stem separator.

        Args:
            model_name: The name of the pretrained Demucs model to use.
        """
        self.model_name = model_name
        self._model = None

    def _load_model(self) -> Any:
        from demucs.pretrained import get_model

        if self._model is None:
            logger.info("Loading demucs model '%s'...", self.model_name)
            self._model = get_model(self.model_name)
            if self._model:
                self._model.eval()
        return self._model

    def separate_audio(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        segment_seconds: float = 10.0,
    ) -> dict[str, np.ndarray]:
        """Perform source separation on the given audio array.

        Args:
            audio_data: The input audio waveform, shape (channels, samples).
                        If mono (samples,), it will be converted to stereo.
            sample_rate: The sample rate of the input audio.
            segment_seconds: The length of each chunk for OOM-safe processing.

        Returns:
            A dictionary mapping stem names ('vocals', 'bass', 'drums', 'other')
            to their separated audio waveforms (channels, samples).
        """
        import torch
        from demucs.apply import apply_model
        from demucs.audio import convert_audio

        model = self._load_model()

        # Ensure 2D (channels, samples)
        if audio_data.ndim == 1:
            audio_data = np.expand_dims(audio_data, axis=0)

        # Convert to torch tensor
        mix = torch.from_numpy(audio_data).float()

        # Convert audio to match model expectations
        mix = convert_audio(  # type: ignore
            mix,
            sample_rate,
            model.samplerate,
            model.audio_channels,
        )

        # Add batch dimension: (1, channels, samples)
        mix = mix.unsqueeze(0)

        # Determine device
        device = "cpu"
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"

        model.to(device)
        mix = mix.to(device)

        logger.info("Applying model to mix using device %s...", device)
        # Apply model with chunking
        with torch.no_grad():
            stems = apply_model(
                model,
                mix,
                shifts=1,
                split=True,
                overlap=0.25,
                segment=segment_seconds,
                progress=False,
            )

        # stems shape: [batch, sources, channels, samples]
        # Remove batch dim
        stems_np: np.ndarray = stems[0].cpu().numpy()

        result = {}
        for idx, source_name in enumerate(model.sources):
            result[source_name] = stems_np[idx]

        return result
