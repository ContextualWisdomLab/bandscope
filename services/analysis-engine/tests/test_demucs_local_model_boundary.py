"""Regression contracts for local-only Demucs model admission."""

from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

import pytest

from bandscope_analysis.separation.audio_separator import AudioStemSeparator


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

    def forbidden_remote_lookup(_name: str) -> _FakeModel:
        calls["count"] += 1
        raise AssertionError("remote Demucs lookup must not run without a local checkpoint")

    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=forbidden_remote_lookup,
    )

    with pytest.raises(ValueError, match="model weights are not installed locally"):
        AudioStemSeparator()._load_model()

    assert calls["count"] == 0


def test_demucs_model_load_allows_exact_cached_htdemucs_checkpoint(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Preserve offline use when the canonical checkpoint is already present."""
    checkpoint_root = tmp_path / "torch-hub" / "checkpoints"
    checkpoint_root.mkdir(parents=True)
    (checkpoint_root / "955717e8-8726e21a.th").write_bytes(b"cached-checkpoint-fixture")
    calls: list[str] = []

    def fake_local_lookup(name: str) -> _FakeModel:
        calls.append(name)
        return _FakeModel()

    _install_fake_runtime(
        monkeypatch,
        torch_hub_dir=str(tmp_path / "torch-hub"),
        get_model=fake_local_lookup,
    )

    model = AudioStemSeparator()._load_model()

    assert isinstance(model, _FakeModel)
    assert calls == ["htdemucs"]
