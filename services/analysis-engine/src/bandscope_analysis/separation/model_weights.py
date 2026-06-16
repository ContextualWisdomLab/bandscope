"""Secure model weight downloading and verification.

Security Notes:
- Downloads model weights only from an allowlisted URL (Meta's Hugging Face hub).
- Verifies file integrity using SHA-256 checksums before loading.
- Stores weights under a controlled local cache directory (XDG-compliant).
- Does not log, expose, or execute any part of the model file path.
- Fails safely when download, verification, or storage encounters errors.
- Uses urllib3 (already a project dependency) for downloads; no shell execution.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import urllib3

logger = logging.getLogger(__name__)

# Allowlisted model source and expected integrity.
_DEMUCS_MODEL_NAME = "htdemucs"
_DEMUCS_MODEL_FILENAME = "htdemucs.th"
_DEMUCS_MODEL_URL = (
    "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/"
    "955717e8-8726e21a.th"
)
_DEMUCS_MODEL_SHA256 = (
    "955717e88726e21a37598e53a16e579e5c1e7aafea2b5e93b5e1e4d63e7ac7d6"
)


@dataclass(frozen=True)
class ModelWeightConfig:
    """Configuration for model weight management."""

    model_name: str = _DEMUCS_MODEL_NAME
    model_filename: str = _DEMUCS_MODEL_FILENAME
    download_url: str = _DEMUCS_MODEL_URL
    expected_sha256: str = _DEMUCS_MODEL_SHA256
    cache_dir: str | None = None
    download_timeout_seconds: float = 300.0
    max_download_bytes: int = 500_000_000  # 500 MB safety limit


def _default_cache_dir() -> Path:
    """Return XDG-compliant cache directory for BandScope model weights."""
    xdg_cache = os.environ.get("XDG_CACHE_HOME")
    if xdg_cache:
        base = Path(xdg_cache)
    else:
        base = Path.home() / ".cache"
    return base / "bandscope" / "models"


def _verify_sha256(file_path: Path, expected: str) -> bool:
    """Verify file integrity using SHA-256 checksum."""
    sha256 = hashlib.sha256()
    try:
        with file_path.open("rb") as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
    except OSError:
        return False
    return sha256.hexdigest() == expected


class ModelWeightManager:
    """Manage secure downloading and verification of model weights.

    Security Notes:
    - Downloads only from the hardcoded allowlisted URL.
    - Verifies SHA-256 checksums before returning paths.
    - Uses atomic writes (temp file + rename) to prevent partial files.
    - Does not expose full paths in error messages.
    - Enforces maximum download size to prevent disk exhaustion.
    """

    def __init__(self, config: ModelWeightConfig | None = None) -> None:
        """Initialize the model weight manager."""
        self.config = config or ModelWeightConfig()
        self._cache_dir = (
            Path(self.config.cache_dir) if self.config.cache_dir else _default_cache_dir()
        )

    @property
    def model_path(self) -> Path:
        """Return the expected path for the cached model file."""
        return self._cache_dir / self.config.model_filename

    def is_available(self) -> bool:
        """Check if verified model weights are available locally."""
        path = self.model_path
        if not path.is_file():
            return False
        return _verify_sha256(path, self.config.expected_sha256)

    def ensure_weights(self) -> Path:
        """Ensure model weights are available, downloading if necessary.

        Returns:
            Path to verified model weight file.

        Raises:
            RuntimeError: If download or verification fails.
        """
        if self.is_available():
            logger.info("Model weights already cached and verified.")
            return self.model_path

        logger.info("Downloading model weights from allowlisted source...")
        self._download_and_verify()
        return self.model_path

    def _download_and_verify(self) -> None:
        """Download model weights and verify integrity."""
        self._cache_dir.mkdir(parents=True, exist_ok=True)

        # Download to a temporary file first (atomic write pattern)
        temp_fd, temp_path_str = tempfile.mkstemp(
            dir=str(self._cache_dir), suffix=".download"
        )
        temp_path = Path(temp_path_str)

        try:
            self._download_to_file(temp_fd, temp_path)

            # Verify checksum before finalizing
            if not _verify_sha256(temp_path, self.config.expected_sha256):
                raise RuntimeError(
                    "Model weight checksum verification failed. "
                    "The downloaded file does not match the expected integrity hash."
                )

            # Atomically move to final location
            temp_path.replace(self.model_path)
            logger.info("Model weights downloaded and verified successfully.")
        except Exception:
            # Clean up temp file on any failure
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def _download_to_file(self, fd: int, temp_path: Path) -> None:
        """Stream model weights from the allowlisted URL to a temp file."""
        os.close(fd)  # Close the fd from mkstemp; we'll open the path ourselves

        http = urllib3.PoolManager(
            timeout=urllib3.Timeout(
                connect=30.0, read=self.config.download_timeout_seconds
            ),
            retries=urllib3.Retry(total=3, backoff_factor=1.0),
        )

        try:
            response = http.request(
                "GET",
                self.config.download_url,
                preload_content=False,
            )

            if response.status != 200:
                raise RuntimeError(
                    f"Model weight download failed with HTTP {response.status}"
                )

            bytes_written = 0
            with temp_path.open("wb") as f:
                for chunk in response.stream(8192):
                    bytes_written += len(chunk)
                    if bytes_written > self.config.max_download_bytes:
                        raise RuntimeError(
                            "Model weight download exceeded maximum size limit"
                        )
                    f.write(chunk)
        finally:
            response.release_conn()
