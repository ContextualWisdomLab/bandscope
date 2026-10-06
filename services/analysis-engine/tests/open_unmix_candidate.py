"""Offline UMX-HQ reference adapter for #828; never a release-admission authority.

The caller supplies already-acquired immutable bytes and a separately reviewed
receipt. Matching caller-supplied hashes establishes consistency, not origin,
license clearance, safety of arbitrary checkpoints, or release readiness. This
module deliberately lives outside the installed analysis package. Distribution
#1180 owns acquisition, filesystem admission, signing and production loading.
"""

from __future__ import annotations

import hashlib
import io
import os
import re
from collections import OrderedDict
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version
from types import MappingProxyType
from typing import Any, Mapping

import numpy as np

CANONICAL_STEMS = ("vocals", "bass", "drums", "other")
UMXHQ_FILENAMES = MappingProxyType(
    {
        "vocals": "vocals-b62c91ce.pth",
        "bass": "bass-8d85a5bd.pth",
        "drums": "drums-9619578f.pth",
        "other": "other-b52fbbf7.pth",
    }
)
REFERENCE_PACKAGE_VERSION = "1.3.0"
_MAX_CHECKPOINT_BYTES = 64 * 1024 * 1024
_MAX_AUDIO_SAMPLES = 44100 * 900


class CandidateRejected(ValueError):
    """A reference candidate failed a bounded, non-authorizing validation step."""


@dataclass(frozen=True)
class CheckpointReceipt:
    """Expected source identity supplied by the independent artifact evaluator."""

    filename: str
    size_bytes: int
    sha256: str


def _check_runtime_environment() -> None:
    """Refuse inherited deserialization downgrades and unadmitted backend imports."""
    # Unset is enabled in upstream PyTorch, not a safe default.
    if os.environ.get("TORCH_DEVICE_BACKEND_AUTOLOAD") != "0":
        raise CandidateRejected("candidate_runtime_environment_rejected")
    if os.environ.get("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "").strip().lower() not in (
        "",
        "0",
        "false",
        "no",
        "n",
    ):
        raise CandidateRejected("candidate_runtime_environment_rejected")


def _runtime_components() -> tuple[Any, Any, Any, int]:
    """Import the pinned reference implementation without a pretrained factory."""
    try:
        installed_version = package_version("openunmix")
    except PackageNotFoundError:
        raise CandidateRejected("candidate_runtime_unavailable") from None
    if installed_version != REFERENCE_PACKAGE_VERSION:
        raise CandidateRejected("candidate_runtime_version_mismatch")
    try:
        import torch
        from openunmix.model import OpenUnmix, Separator
        from openunmix.utils import bandwidth_to_max_bin
    except ImportError:
        raise CandidateRejected("candidate_runtime_unavailable") from None
    if torch.serialization.get_safe_globals():
        raise CandidateRejected("candidate_safe_globals_rejected")
    max_bin = bandwidth_to_max_bin(rate=44100.0, n_fft=4096, bandwidth=16000)
    return torch, OpenUnmix, Separator, max_bin


def load_umxhq_candidate(
    checkpoints: Mapping[str, bytes], receipts: Mapping[str, CheckpointReceipt]
) -> Any:
    """Build all four UMX-HQ targets from exact in-memory bytes, with no fallback.

    Receipts must come from an independent reviewed acquisition, not from a hash
    generated on arbitrary input just before this call. The loader returns a
    reference model only; it never changes the commercial release policy.
    """
    if type(checkpoints) is not dict or type(receipts) is not dict:
        raise CandidateRejected("candidate_stem_set_rejected")
    if set(checkpoints) != set(CANONICAL_STEMS) or set(receipts) != set(CANONICAL_STEMS):
        raise CandidateRejected("candidate_stem_set_rejected")
    checkpoint_snapshot = checkpoints.copy()
    receipt_snapshot = receipts.copy()
    for stem in CANONICAL_STEMS:
        payload = checkpoint_snapshot[stem]
        receipt = receipt_snapshot[stem]
        if type(payload) is not bytes or type(receipt) is not CheckpointReceipt:
            raise CandidateRejected("candidate_artifact_identity_rejected")
        if (
            receipt.filename != UMXHQ_FILENAMES[stem]
            or type(receipt.size_bytes) is not int
            or not 0 < receipt.size_bytes <= _MAX_CHECKPOINT_BYTES
            or len(payload) != receipt.size_bytes
            or type(receipt.sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", receipt.sha256) is None
            or hashlib.sha256(payload).hexdigest() != receipt.sha256
        ):
            raise CandidateRejected("candidate_artifact_identity_rejected")

    _check_runtime_environment()
    torch, target_factory, separator_factory, max_bin = _runtime_components()
    target_models = {}
    try:
        for stem in CANONICAL_STEMS:
            state = torch.load(
                io.BytesIO(checkpoint_snapshot[stem]), map_location="cpu", weights_only=True
            )
            if type(state) not in (dict, OrderedDict) or not state:
                raise CandidateRejected("candidate_checkpoint_state_rejected")
            target_model = target_factory(
                nb_bins=2049, nb_channels=2, hidden_size=512, max_bin=max_bin
            )
            expected_state = target_model.state_dict()
            if set(state) != set(expected_state):
                raise CandidateRejected("candidate_checkpoint_state_rejected")
            for name, tensor in state.items():
                expected_tensor = expected_state[name]
                if (
                    type(name) is not str
                    or type(tensor) is not torch.Tensor
                    or tensor.layout != torch.strided
                    or tensor.shape != expected_tensor.shape
                    or tensor.dtype != expected_tensor.dtype
                    or not bool(torch.isfinite(tensor).all())
                ):
                    raise CandidateRejected("candidate_checkpoint_state_rejected")
            target_model.load_state_dict(state, strict=True)
            target_models[stem] = target_model
        separator = separator_factory(
            target_models=target_models,
            niter=1,
            residual=False,
            n_fft=4096,
            n_hop=1024,
            nb_channels=2,
            sample_rate=44100.0,
            wiener_win_len=300,
            filterbank="torch",
        )
        separator.eval()
        separator.requires_grad_(False)
        return separator
    except CandidateRejected:
        raise
    except Exception:
        raise CandidateRejected("candidate_checkpoint_decode_rejected") from None


def separate_umxhq_candidate(
    separator: Any, stereo_audio: np.ndarray, sample_rate: int
) -> dict[str, np.ndarray]:
    """Preserve 44.1-kHz stereo and explicit stem order without padding or clipping.

    Mono delivery must be a separately measured caller policy. This reference
    adapter does not resample, manufacture a missing stem, or emit quality scores.
    """
    if (
        type(sample_rate) is not int
        or sample_rate != 44100
        or type(stereo_audio) is not np.ndarray
        or stereo_audio.ndim != 2
        or stereo_audio.shape[0] != 2
        or not 2048 < stereo_audio.shape[1] <= _MAX_AUDIO_SAMPLES
        or stereo_audio.dtype.kind != "f"
        or not np.isfinite(stereo_audio).all()
        or (np.abs(stereo_audio) > np.finfo(np.float32).max).any()
    ):
        raise CandidateRejected("candidate_audio_contract_rejected")
    _check_runtime_environment()
    torch, _, _, _ = _runtime_components()
    if tuple(separator.target_models) != CANONICAL_STEMS:
        raise CandidateRejected("candidate_output_contract_rejected")
    waveform = torch.from_numpy(np.array(stereo_audio, dtype=np.float32, copy=True)).unsqueeze(0)
    try:
        with torch.inference_mode():
            outputs = separator(waveform).detach().cpu().numpy()
    except Exception:
        raise CandidateRejected("candidate_inference_rejected") from None
    if (
        type(outputs) is not np.ndarray
        or outputs.dtype != np.float32
        or outputs.shape != (1, 4, 2, stereo_audio.shape[1])
        or not np.isfinite(outputs).all()
    ):
        raise CandidateRejected("candidate_output_contract_rejected")
    return {stem: outputs[0, index].copy() for index, stem in enumerate(CANONICAL_STEMS)}
