"""Regression contracts for local-only Demucs model admission."""

from __future__ import annotations

import hashlib
import pickle
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

import bandscope_analysis.separation.audio_separator as audio_separator_module


class _FakeModel:
    """Minimal Demucs model stand-in for the model-loading boundary."""

    sources = ["drums", "bass", "other", "vocals"]

    def eval(self) -> "_FakeModel":
        """Match the model evaluation call used after admission."""
        return self


def _install_fake_runtime(
    monkeypatch: pytest.MonkeyPatch,
    *,
    torch_hub_dir: str,
    get_model: object,
) -> None:
    """Install deterministic torch/Demucs import boundaries for local-model tests."""
    fake_torch = ModuleType("torch")
    fake_torch.hub = SimpleNamespace(get_dir=lambda: torch_hub_dir)  # type: ignore[attr-defined]

    demucs_module = ModuleType("demucs")
    pretrained_module = ModuleType("demucs.pretrained")
    pretrained_module.get_model = get_model  # type: ignore[attr-defined]
    demucs_module.pretrained = pretrained_module  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "demucs", demucs_module)
    monkeypatch.setitem(sys.modules, "demucs.pretrained", pretrained_module)


def test_demucs_model_load_fails_closed_before_remote_lookup_when_checkpoint_missing(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep first-run local analysis from turning into a model network download."""
    calls = {"count": 0}

    def forbidden_remote_lookup(_name: str, **_kwargs: object) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("remote Demucs lookup must not run without a local checkpoint")

    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_remote_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        audio_separator_module.AudioStemSeparator()._load_model()

    assert calls["count"] == 0


def test_demucs_model_load_uses_verified_private_snapshot_in_local_repo(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Deserialize the verified bytes, not a later replacement of the cache pathname."""
    checkpoint_bytes = b"cached-checkpoint-fixture"
    checksum_prefix = hashlib.sha256(checkpoint_bytes).hexdigest()[:8]
    checkpoint_name = f"955717e8-{checksum_prefix}.th"
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    checkpoint_path = checkpoint_root / checkpoint_name
    checkpoint_path.write_bytes(checkpoint_bytes)
    calls: list[tuple[str, Path]] = []

    def fake_local_lookup(name: str, *, repo: Path | None = None) -> _FakeModel:
        assert name == "955717e8"
        assert repo is not None
        snapshot_path = repo / checkpoint_name
        assert snapshot_path.read_bytes() == checkpoint_bytes

        checkpoint_path.write_bytes(b"cache-path-replaced-after-snapshot")
        assert snapshot_path.read_bytes() == checkpoint_bytes
        calls.append((name, repo))
        return _FakeModel()

    monkeypatch.setattr(
        audio_separator_module,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": checkpoint_name},
    )
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=fake_local_lookup,
    )

    model = audio_separator_module.AudioStemSeparator()._load_model()

    assert isinstance(model, _FakeModel)
    assert len(calls) == 1
    assert calls[0][0] == "955717e8"
    assert not calls[0][1].exists()


def test_demucs_model_load_rejects_tampered_cached_checkpoint(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject cached bytes that do not match the checkpoint filename checksum."""
    trusted_bytes = b"trusted-checkpoint-fixture"
    checksum_prefix = hashlib.sha256(trusted_bytes).hexdigest()[:8]
    checkpoint_name = f"955717e8-{checksum_prefix}.th"
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    (checkpoint_root / checkpoint_name).write_bytes(b"tampered-checkpoint-fixture")
    calls = {"count": 0}

    def forbidden_lookup(_name: str, **_kwargs: object) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("tampered checkpoint must not reach Demucs deserialization")

    monkeypatch.setattr(
        audio_separator_module,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": checkpoint_name},
    )
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        audio_separator_module.AudioStemSeparator()._load_model()

    assert calls["count"] == 0


def test_demucs_model_load_rejects_checkpoint_over_resource_limit_before_resolver(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject an oversized cache object before copying or deserializing it."""
    checkpoint_bytes = b"oversized-checkpoint-fixture"
    checksum_prefix = hashlib.sha256(checkpoint_bytes).hexdigest()[:8]
    checkpoint_name = f"955717e8-{checksum_prefix}.th"
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    (checkpoint_root / checkpoint_name).write_bytes(checkpoint_bytes)
    calls = {"count": 0}

    def forbidden_lookup(_name: str, **_kwargs: object) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("oversized checkpoint must not reach Demucs deserialization")

    monkeypatch.setattr(
        audio_separator_module,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": checkpoint_name},
    )
    monkeypatch.setattr(
        audio_separator_module,
        "_MAX_LOCAL_DEMUCS_CHECKPOINT_BYTES",
        len(checkpoint_bytes) - 1,
        raising=False,
    )
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        audio_separator_module.AudioStemSeparator()._load_model()

    assert calls["count"] == 0


def test_demucs_model_load_rejects_checkpoint_growth_after_descriptor_preflight(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject bytes beyond the descriptor size admitted before snapshot copy."""
    checkpoint_bytes = b"checkpoint-grew-after-preflight"
    checksum_prefix = hashlib.sha256(checkpoint_bytes).hexdigest()[:8]
    checkpoint_name = f"955717e8-{checksum_prefix}.th"
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    checkpoint_path = checkpoint_root / checkpoint_name
    checkpoint_path.write_bytes(checkpoint_bytes)
    checkpoint_stat = checkpoint_path.stat()
    calls = {"count": 0}

    def forbidden_lookup(_name: str, **_kwargs: object) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("post-preflight growth must not reach Demucs deserialization")

    real_fstat = audio_separator_module.os.fstat

    def stale_preflight_size(descriptor: int) -> object:
        current = real_fstat(descriptor)
        if current.st_dev == checkpoint_stat.st_dev and current.st_ino == checkpoint_stat.st_ino:
            return SimpleNamespace(
                st_mode=current.st_mode,
                st_dev=current.st_dev,
                st_ino=current.st_ino,
                st_size=current.st_size - 1,
            )
        return current

    monkeypatch.setattr(
        audio_separator_module,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": checkpoint_name},
    )
    monkeypatch.setattr(audio_separator_module.os, "fstat", stale_preflight_size)
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        audio_separator_module.AudioStemSeparator()._load_model()

    assert calls["count"] == 0


def test_demucs_model_load_bounds_pytorch_weights_only_incompatibility(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep PyTorch 2.6+ weights-only failures inside the local-model boundary."""
    checkpoint_bytes = b"legacy-demucs-package-fixture"
    checksum_prefix = hashlib.sha256(checkpoint_bytes).hexdigest()[:8]
    checkpoint_name = f"955717e8-{checksum_prefix}.th"
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    (checkpoint_root / checkpoint_name).write_bytes(checkpoint_bytes)

    def incompatible_weights_only_load(_name: str, **_kwargs: object) -> _FakeModel:
        raise pickle.UnpicklingError(
            "Weights only load failed: unsupported GLOBAL demucs.htdemucs.HTDemucs"
        )

    monkeypatch.setattr(
        audio_separator_module,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": checkpoint_name},
    )
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=incompatible_weights_only_load,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally") as failure:
        audio_separator_module.AudioStemSeparator()._load_model()

    assert "HTDemucs" not in str(failure.value)


@pytest.mark.parametrize("unsafe_override", ["1", "y", "yes", "true", "TRUE"])
def test_demucs_model_load_rejects_environment_override_that_disables_weights_only(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    unsafe_override: str,
) -> None:
    """Do not let process environment reactivate unrestricted pickle loading."""
    checkpoint_bytes = b"environment-override-checkpoint-fixture"
    checksum_prefix = hashlib.sha256(checkpoint_bytes).hexdigest()[:8]
    checkpoint_name = f"955717e8-{checksum_prefix}.th"
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    (checkpoint_root / checkpoint_name).write_bytes(checkpoint_bytes)
    calls = {"count": 0}

    def forbidden_unsafe_lookup(_name: str, **_kwargs: object) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("unsafe weights-only override must fail before deserialization")

    monkeypatch.setattr(
        audio_separator_module,
        "_DEMUCS_LOCAL_CHECKPOINTS",
        {"htdemucs": checkpoint_name},
    )
    monkeypatch.setenv("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", unsafe_override)
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_unsafe_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        audio_separator_module.AudioStemSeparator()._load_model()

    assert calls["count"] == 0


def test_demucs_model_load_rejects_backend_autoload_environment(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not let torch import auto-load out-of-tree backend extensions."""
    calls = {"count": 0}

    def forbidden_lookup(_name: str, **_kwargs: object) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("backend autoload must fail before Demucs or torch import")

    monkeypatch.setenv("TORCH_DEVICE_BACKEND_AUTOLOAD", "1")
    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        audio_separator_module.AudioStemSeparator()._load_model()

    assert calls["count"] == 0
