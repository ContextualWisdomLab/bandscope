"""Secure model-weight helpers for local stem separation."""

from __future__ import annotations

import hashlib
import os
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import urllib3

DEFAULT_MODEL_HOST_ALLOWLIST: Final[frozenset[str]] = frozenset(
    {"github.com", "objects.githubusercontent.com", "raw.githubusercontent.com"}
)
DEFAULT_MODEL_CACHE_ENV: Final[str] = "BANDSCOPE_MODEL_CACHE"


@dataclass(frozen=True)
class ModelWeightSpec:
    """Immutable model artifact metadata used for safe acquisition."""

    file_name: str
    source_url: str
    sha256: str
    max_bytes: int
    allowed_hosts: frozenset[str] = DEFAULT_MODEL_HOST_ALLOWLIST


DEFAULT_STEM_PRIOR_SPEC: Final[ModelWeightSpec] = ModelWeightSpec(
    file_name="stem-priors-v1.npz",
    source_url=(
        "https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/stem-priors-v1.npz"
    ),
    sha256="f13ecb6ffdc8f94567df4af41db0adcc8c52d854be06a3f66f30f0b7308f470f",
    max_bytes=4 * 1024 * 1024,
)


def default_model_cache_dir() -> Path:
    """Return the app-owned model cache directory."""
    configured = os.environ.get(DEFAULT_MODEL_CACHE_ENV)
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".cache" / "bandscope" / "models"


def ensure_verified_model_weights(
    spec: ModelWeightSpec = DEFAULT_STEM_PRIOR_SPEC,
    *,
    cache_dir: Path | None = None,
    download_if_missing: bool = False,
    http: urllib3.PoolManager | None = None,
) -> Path | None:
    """Ensure model weights exist and match the expected digest.

    Security Notes:
    - Only HTTPS URLs from an allowlisted host set are accepted.
    - Download size is bounded (`max_bytes`) and checked while streaming.
    - Downloaded bytes are SHA-256 verified before an atomic replace.
    - Missing files return `None` unless explicitly allowed to download.
    """

    root = (cache_dir or default_model_cache_dir()).expanduser()
    destination = root / spec.file_name
    if destination.exists():
        verify_model_weights(destination, spec)
        return destination
    if not download_if_missing:
        return None
    return download_model_weights(spec, destination=destination, http=http)


def verify_model_weights(path: Path, spec: ModelWeightSpec = DEFAULT_STEM_PRIOR_SPEC) -> None:
    """Raise ``ValueError`` when a model file does not match the expected digest."""
    if path.name != spec.file_name:
        raise ValueError(f"Unexpected model artifact filename: {path.name}")
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        while True:
            chunk = model_file.read(64 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    if digest.hexdigest() != spec.sha256:
        raise ValueError(f"Model artifact digest mismatch for {path.name}")


def download_model_weights(
    spec: ModelWeightSpec,
    *,
    destination: Path,
    http: urllib3.PoolManager | None = None,
) -> Path:
    """Download and verify a model artifact into the app-owned model cache."""
    _validate_download_spec(spec)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_suffix(f"{destination.suffix}.tmp")

    client = http or urllib3.PoolManager()
    response = client.request("GET", spec.source_url, preload_content=False)
    try:
        if response.status != 200:
            raise ValueError(f"Model artifact download failed with HTTP {response.status}")
        digest = hashlib.sha256()
        total_bytes = 0
        with temp_path.open("wb") as model_file:
            for chunk in response.stream(64 * 1024):
                if not chunk:
                    continue
                total_bytes += len(chunk)
                if total_bytes > spec.max_bytes:
                    raise ValueError("Model artifact exceeds allowed maximum download size")
                digest.update(chunk)
                model_file.write(chunk)
        if digest.hexdigest() != spec.sha256:
            raise ValueError(f"Model artifact digest mismatch for {spec.file_name}")
        temp_path.replace(destination)
        return destination
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        response.release_conn()


def _validate_download_spec(spec: ModelWeightSpec) -> None:
    """Validate URL and hash policy before opening any network connection."""
    parsed = urllib.parse.urlparse(spec.source_url)
    if parsed.scheme != "https":
        raise ValueError("Model artifact URL must use HTTPS")
    hostname = parsed.hostname or ""
    if hostname not in spec.allowed_hosts:
        raise ValueError("Model artifact URL host is not allowlisted")
    if len(spec.sha256) != 64 or any(ch not in "0123456789abcdef" for ch in spec.sha256):
        raise ValueError("Model artifact sha256 must be a lower-case 64-char hex digest")
