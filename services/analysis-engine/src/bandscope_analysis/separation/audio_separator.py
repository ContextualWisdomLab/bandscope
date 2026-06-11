"""Audio source separation using Demucs."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class AudioStemSeparator:
    """Isolates standard stems from an audio mix using Demucs.

    Security Notes:
    - Trust boundary: Audio input is passed as raw numpy arrays from a prior decoding step
      (e.g. librosa), reducing the risk of codec-based exploitation within Demucs itself.
    - Limits: Employs chunked inference (split=True) to strictly bound peak memory (OOM avoidance).
    - Network: Requires pre-provisioned model weights in the local model cache; it does not
      download model artifacts at runtime.
    """

    def __init__(self, model_name: str = "htdemucs") -> None:
        """Initialize the audio stem separator.

        Args:
            model_name: The name of the pretrained Demucs model to use.
        """
        self.model_name = model_name
        self._model = None

    def _load_model(self) -> Any:
        import hashlib
        from pathlib import Path

        from demucs.states import load_model

        if self._model is None:
            logger.info("Loading demucs model '%s'...", self.model_name)

            cache_dir = Path.home() / ".cache" / "torch" / "hub" / "checkpoints"
            expected_prefix = "f7e0c4bc"
            model_file = cache_dir / f"{expected_prefix}-ba3fe64a.th"

            if not model_file.exists():
                raise RuntimeError(
                    f"Pre-provisioned model {self.model_name} not found at {model_file}"
                )

            # Verify checksum
            sha256_hash = hashlib.sha256()
            with open(model_file, "rb") as f:
                for chunk in iter(lambda: f.read(4096 * 1024), b""):
                    sha256_hash.update(chunk)

            if not sha256_hash.hexdigest().startswith(expected_prefix):
                raise RuntimeError("Model checksum mismatch")

            self._model = load_model(model_file)  # type: ignore[no-untyped-call]
            if self._model:
                self._model.eval()
        return self._model

    def separate_audio(
        self,
        audio_data: NDArray[np.floating[Any]],
        sample_rate: int,
        segment_seconds: float = 10.0,
    ) -> dict[str, NDArray[np.floating[Any]]]:
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
        stems_np: NDArray[np.floating[Any]] = stems[0].cpu().numpy()

        result: dict[str, NDArray[np.floating[Any]]] = {}
        for idx, source_name in enumerate(model.sources):
            result[source_name] = stems_np[idx]

        return result
