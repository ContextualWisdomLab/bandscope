"""Run an actual-library architecture UNIT smoke in a dedicated interpreter.

No pretrained checkpoint or real-audio quality is evaluated. This script is not
named test_*: it is an explicit dependency-requiring reference check, not a
silently skipped part of ordinary CI. It changes safe_globals only in its own
process and never relaxes the candidate loader's empty-allowlist requirement.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
from importlib.metadata import version

import numpy as np

from open_unmix_candidate import (
    CANONICAL_STEMS,
    UMXHQ_FILENAMES,
    CandidateRejected,
    CheckpointReceipt,
    _check_runtime_environment,
    load_umxhq_candidate,
    separate_umxhq_candidate,
)


def _deny_network(event: str, arguments: tuple) -> None:
    """Reject Python socket operations during this functional smoke, not sandbox native code."""
    if event in ("socket.connect", "socket.getaddrinfo", "socket.sendto"):
        raise RuntimeError("Network use is forbidden in the candidate smoke")


def _checkpoint_tripwire() -> None:
    """Never execute a callable restored from a serialized checkpoint."""
    raise AssertionError("Checkpoint callable executed")


class NonTensorCheckpoint:
    """Represent a benign callable payload that weights-only loading must reject."""

    def __reduce__(self):
        return (_checkpoint_tripwire, ())


def main() -> None:
    """Exercise real PyTorch loading and all four real Open-Unmix model architectures."""
    os.environ.setdefault("TORCH_DEVICE_BACKEND_AUTOLOAD", "0")
    _check_runtime_environment()
    sys.addaudithook(_deny_network)
    import torch
    from openunmix.model import OpenUnmix
    from openunmix.utils import bandwidth_to_max_bin

    torch.set_num_threads(2)
    torch.manual_seed(1181)
    initial_safe_globals = len(torch.serialization.get_safe_globals())
    # PyTorch 2.10 registers nested-tensor helpers during import. Restrict only this
    # dedicated unit-test worker, never the host app or an unrelated test process.
    torch.serialization.clear_safe_globals()
    max_bin = bandwidth_to_max_bin(rate=44100.0, n_fft=4096, bandwidth=16000)
    unit_model = OpenUnmix(nb_bins=2049, nb_channels=2, hidden_size=512, max_bin=max_bin)
    serialized = io.BytesIO()
    torch.save(unit_model.state_dict(), serialized)
    blob = serialized.getvalue()
    blobs = dict.fromkeys(CANONICAL_STEMS, blob)
    receipts = {
        stem: CheckpointReceipt(UMXHQ_FILENAMES[stem], len(blob), hashlib.sha256(blob).hexdigest())
        for stem in CANONICAL_STEMS
    }
    separator = load_umxhq_candidate(blobs, receipts)
    audio = np.random.default_rng(1180).normal(0, 0.05, (2, 4410)).astype(np.float32)
    output = separate_umxhq_candidate(separator, audio, 44100)
    assert tuple(output) == CANONICAL_STEMS
    assert all(stem.shape == (2, 4410) and np.isfinite(stem).all() for stem in output.values())
    bad = io.BytesIO()
    torch.save(NonTensorCheckpoint(), bad)
    bad_blob = bad.getvalue()
    blobs["vocals"] = bad_blob
    receipts["vocals"] = CheckpointReceipt(
        UMXHQ_FILENAMES["vocals"], len(bad_blob), hashlib.sha256(bad_blob).hexdigest()
    )
    try:
        load_umxhq_candidate(blobs, receipts)
    except CandidateRejected:
        pass
    else:
        raise AssertionError("A code-bearing checkpoint was not rejected")
    print(json.dumps({
        "status": "pass",
        "evidence_class": "architecture_unit_only",
        "weights": "random_initialization_unit_fixture_not_pretrained",
        "audio": "synthetic_unit_fixture_not_scientific_acceptance",
        "stem_shapes": {stem: list(samples.shape) for stem, samples in output.items()},
        "openunmix": version("openunmix"),
        "torch": version("torch"),
        "torchaudio": version("torchaudio"),
        "initial_process_safe_globals": initial_safe_globals,
        "worker_process_safe_globals": len(torch.serialization.get_safe_globals()),
        "restricted_object_rejected": True,
        "python_socket_operations": "denied_by_audit_hook_not_a_native_sandbox",
        "pretrained_quality_measured": False,
        "native_packaging_measured": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
