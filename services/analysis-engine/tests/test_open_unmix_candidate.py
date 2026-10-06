"""Offline control tests; fake tensors are not source-separation quality evidence."""

from __future__ import annotations

import contextlib
import hashlib
import importlib
import sys
from collections import OrderedDict
from types import SimpleNamespace

import numpy as np
import pytest


@pytest.fixture(autouse=True)
def isolated_reference_environment(monkeypatch):
    """Match the explicit worker initialization, never inherit backend activation."""
    monkeypatch.setenv("TORCH_DEVICE_BACKEND_AUTOLOAD", "0")
    monkeypatch.delenv("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", raising=False)


def candidate_module():
    """Make the absent candidate path a test failure rather than a collection error."""
    try:
        return importlib.import_module("open_unmix_candidate")
    except ModuleNotFoundError:
        pytest.fail("The local-only UMX-HQ candidate adapter has not been implemented")


class FakeTensor:
    """Model the tensor boundary without importing optional inference dependencies."""

    def __init__(self, values):
        self.values = np.asarray(values)
        self.shape = self.values.shape
        self.dtype = self.values.dtype
        self.layout = "strided"

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.values

    def unsqueeze(self, dimension):
        return FakeTensor(np.expand_dims(self.values, dimension))


class FakeTargetModel:
    """Expose the strict model-state contract without implementing a separator."""

    def __init__(self, **kwargs):
        self.parameters = kwargs
        self.loaded = False

    def state_dict(self):
        return {"weight": FakeTensor(np.zeros(2, dtype=np.float32))}

    def load_state_dict(self, state, *, strict):
        assert strict is True
        self.loaded = True


class FakeSeparator:
    """Return distinct values to expose accidental stem-order and channel changes."""

    def __init__(self, **kwargs):
        self.parameters = kwargs
        self.target_models = kwargs["target_models"]
        self.training = True
        self.gradients = True
        self.output_override = None

    def eval(self):
        self.training = False
        return self

    def requires_grad_(self, enabled):
        self.gradients = enabled
        return self

    def __call__(self, audio):
        if self.output_override is not None:
            return self.output_override
        return FakeTensor(np.stack([audio.values * (i + 1) for i in range(4)], axis=1))


def install_fake_runtime(monkeypatch, module):
    calls = []
    state = {"weight": FakeTensor(np.ones(2, dtype=np.float32))}
    torch = SimpleNamespace(
        Tensor=FakeTensor,
        strided="strided",
        serialization=SimpleNamespace(get_safe_globals=lambda: []),
        from_numpy=lambda array: FakeTensor(array),
        inference_mode=contextlib.nullcontext,
        isfinite=lambda tensor: np.isfinite(tensor.values),
    )

    def tensor_load(stream, *, map_location, weights_only):
        calls.append((stream.read(), map_location, weights_only))
        return state

    torch.load = tensor_load
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "openunmix", SimpleNamespace())
    monkeypatch.setitem(
        sys.modules,
        "openunmix.model",
        SimpleNamespace(OpenUnmix=FakeTargetModel, Separator=FakeSeparator),
    )
    monkeypatch.setitem(
        sys.modules, "openunmix.utils", SimpleNamespace(bandwidth_to_max_bin=lambda **kwargs: 1487)
    )
    monkeypatch.setattr(module, "package_version", lambda name: "1.3.0")
    return torch, calls, state


def candidate_inputs(module):
    blobs = {stem: (stem + "-tensor-fixture").encode() for stem in module.CANONICAL_STEMS}
    receipts = {
        stem: module.CheckpointReceipt(
            filename=module.UMXHQ_FILENAMES[stem],
            size_bytes=len(blob),
            sha256=hashlib.sha256(blob).hexdigest(),
        )
        for stem, blob in blobs.items()
    }
    return blobs, receipts


def test_full_set_is_checked_before_first_deserialization(monkeypatch):
    module = candidate_module()
    _, calls, _ = install_fake_runtime(monkeypatch, module)
    blobs, receipts = candidate_inputs(module)
    blobs["other"] = b"altered"
    with pytest.raises(module.CandidateRejected, match="artifact_identity"):
        module.load_umxhq_candidate(blobs, receipts)
    assert calls == []


def test_explicit_core_construction_has_no_pretrained_factory(monkeypatch):
    module = candidate_module()
    _, calls, _ = install_fake_runtime(monkeypatch, module)
    blobs, receipts = candidate_inputs(module)
    separator = module.load_umxhq_candidate(blobs, receipts)
    assert len(calls) == 4
    assert all(location == "cpu" and restricted is True for _, location, restricted in calls)
    assert tuple(separator.target_models) == ("vocals", "bass", "drums", "other")
    assert separator.training is False and separator.gradients is False
    assert separator.parameters["niter"] == 1
    assert separator.parameters["residual"] is False
    assert separator.parameters["filterbank"] == "torch"
    assert all(model.loaded for model in separator.target_models.values())
    assert all(model.parameters["hidden_size"] == 512 for model in separator.target_models.values())


@pytest.mark.parametrize(
    "changed", ["missing_blob", "extra_blob", "missing_receipt", "extra_receipt"]
)
def test_incomplete_or_expanded_stem_set_fails_closed(monkeypatch, changed):
    module = candidate_module()
    _, calls, _ = install_fake_runtime(monkeypatch, module)
    blobs, receipts = candidate_inputs(module)
    target = blobs if changed.endswith("blob") else receipts
    if changed.startswith("missing"):
        target.pop("bass")
    else:
        target["umxl"] = next(iter(target.values()))
    with pytest.raises(module.CandidateRejected, match="stem_set"):
        module.load_umxhq_candidate(blobs, receipts)
    assert calls == []


@pytest.mark.parametrize(
    "field,value",
    [
        ("filename", "vocals-bccbd9aa.pth"),
        ("filename", "../vocals-b62c91ce.pth"),
        ("size_bytes", True),
        ("size_bytes", 0),
        ("size_bytes", 64 * 1024 * 1024 + 1),
        ("size_bytes", 1.0),
        ("sha256", None),
        ("sha256", "b62c91ce"),
        ("sha256", "A" * 64),
        ("sha256", "0" * 64),
    ],
)
def test_receipt_cannot_rename_or_admit_wrong_bytes(monkeypatch, field, value):
    module = candidate_module()
    _, calls, _ = install_fake_runtime(monkeypatch, module)
    blobs, receipts = candidate_inputs(module)
    values = vars(receipts["vocals"]) | {field: value}
    receipts["vocals"] = module.CheckpointReceipt(**values)
    with pytest.raises(module.CandidateRejected):
        module.load_umxhq_candidate(blobs, receipts)
    assert calls == []


@pytest.mark.parametrize("blob", [bytearray(b"mutable"), memoryview(b"mutable"), "not-bytes", b""])
def test_only_nonempty_immutable_bytes_enter_loader(monkeypatch, blob):
    module = candidate_module()
    _, calls, _ = install_fake_runtime(monkeypatch, module)
    blobs, receipts = candidate_inputs(module)
    blobs["bass"] = blob
    with pytest.raises(module.CandidateRejected):
        module.load_umxhq_candidate(blobs, receipts)
    assert calls == []


@pytest.mark.parametrize(
    "name,value",
    [
        ("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1"),
        ("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "TRUE"),
        ("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "unexpected"),
        ("TORCH_DEVICE_BACKEND_AUTOLOAD", "1"),
    ],
)
def test_unsafe_environment_is_rejected_before_runtime(monkeypatch, name, value):
    module = candidate_module()
    monkeypatch.setenv(name, value)
    monkeypatch.setattr(
        module, "_runtime_components", lambda: pytest.fail("runtime import reached")
    )
    blobs, receipts = candidate_inputs(module)
    with pytest.raises(module.CandidateRejected, match="runtime_environment"):
        module.load_umxhq_candidate(blobs, receipts)


def test_nonempty_process_safe_globals_are_not_inherited(monkeypatch):
    module = candidate_module()
    torch, calls, _ = install_fake_runtime(monkeypatch, module)
    torch.serialization.get_safe_globals = lambda: [object]
    blobs, receipts = candidate_inputs(module)
    with pytest.raises(module.CandidateRejected, match="safe_globals"):
        module.load_umxhq_candidate(blobs, receipts)
    assert calls == []


def test_wrong_reference_package_version_is_not_accepted(monkeypatch):
    module = candidate_module()
    _, calls, _ = install_fake_runtime(monkeypatch, module)
    monkeypatch.setattr(module, "package_version", lambda name: "1.4.0")
    blobs, receipts = candidate_inputs(module)
    with pytest.raises(module.CandidateRejected, match="runtime_version"):
        module.load_umxhq_candidate(blobs, receipts)
    assert calls == []


@pytest.mark.parametrize(
    "mutation", ["empty", "object", "missing", "extra", "shape", "dtype", "nan", "sparse"]
)
def test_state_is_tensor_only_complete_and_shape_exact(monkeypatch, mutation):
    module = candidate_module()
    torch, _, state = install_fake_runtime(monkeypatch, module)
    if mutation == "empty":
        torch.load = lambda *args, **kwargs: {}
    elif mutation == "object":
        state["weight"] = object()
    elif mutation == "missing":
        state.clear()
        state["wrong"] = FakeTensor(np.ones(2, dtype=np.float32))
    elif mutation == "extra":
        state["extra"] = FakeTensor(np.ones(2, dtype=np.float32))
    elif mutation == "shape":
        state["weight"] = FakeTensor(np.ones(3, dtype=np.float32))
    elif mutation == "dtype":
        state["weight"] = FakeTensor(np.ones(2, dtype=np.float64))
    elif mutation == "nan":
        state["weight"] = FakeTensor(np.array([1, np.nan], dtype=np.float32))
    else:
        state["weight"].layout = "sparse"
    blobs, receipts = candidate_inputs(module)
    with pytest.raises(module.CandidateRejected, match="checkpoint_state"):
        module.load_umxhq_candidate(blobs, receipts)


def test_decode_failure_is_not_retried_without_weights_only(monkeypatch):
    module = candidate_module()
    torch, _, _ = install_fake_runtime(monkeypatch, module)
    attempts = []

    def fail(*args, **kwargs):
        attempts.append(kwargs)
        raise RuntimeError("private-path-and-model-detail")

    torch.load = fail
    blobs, receipts = candidate_inputs(module)
    with pytest.raises(module.CandidateRejected) as rejected:
        module.load_umxhq_candidate(blobs, receipts)
    assert len(attempts) == 1 and attempts[0]["weights_only"] is True
    assert "private-path" not in str(rejected.value)
    assert rejected.value.__suppress_context__ is True


def test_stereo_output_preserves_canonical_stem_order_and_length(monkeypatch):
    module = candidate_module()
    install_fake_runtime(monkeypatch, module)
    separator = module.load_umxhq_candidate(*candidate_inputs(module))
    audio = np.vstack([np.ones(4096), np.full(4096, 0.25)]).astype(np.float32)
    output = module.separate_umxhq_candidate(separator, audio, 44100)
    assert tuple(output) == module.CANONICAL_STEMS
    for index, stem in enumerate(module.CANONICAL_STEMS):
        np.testing.assert_array_equal(output[stem], audio * (index + 1))
        assert not np.shares_memory(output[stem], audio)


@pytest.mark.parametrize(
    "audio,sr",
    [
        (np.ones(4096), 44100),
        (np.ones((1, 4096)), 44100),
        (np.ones((2, 2048)), 44100),
        (np.ones((2, 4096)), 22050),
        (np.ones((2, 4096)), True),
        (np.ones((2, 4096)), 44100.0),
        (np.full((2, 4096), np.nan), 44100),
        (np.full((2, 4096), np.inf), 44100),
        (np.full((2, 4096), 1e100), 44100),
    ],
)
def test_audio_policy_does_not_hide_resampling_or_nonfinite_data(monkeypatch, audio, sr):
    module = candidate_module()
    monkeypatch.setattr(
        module, "_runtime_components", lambda: pytest.fail("runtime import reached")
    )
    with pytest.raises(module.CandidateRejected, match="audio_contract"):
        module.separate_umxhq_candidate(None, audio, sr)


@pytest.mark.parametrize("problem", ["stem_order", "length", "nonfinite"])
def test_bad_runtime_output_is_not_padded_or_clamped(monkeypatch, problem):
    module = candidate_module()
    install_fake_runtime(monkeypatch, module)
    separator = module.load_umxhq_candidate(*candidate_inputs(module))
    if problem == "stem_order":
        separator.target_models = dict(reversed(list(separator.target_models.items())))
    elif problem == "length":
        separator.output_override = FakeTensor(np.zeros((1, 4, 2, 4000)))
    else:
        separator.output_override = FakeTensor(np.full((1, 4, 2, 4096), np.nan))
    with pytest.raises(module.CandidateRejected, match="output_contract"):
        module.separate_umxhq_candidate(separator, np.zeros((2, 4096), dtype=np.float32), 44100)


def test_unset_backend_autoload_is_enabled_upstream_and_must_be_rejected(monkeypatch):
    module = candidate_module()
    monkeypatch.delenv("TORCH_DEVICE_BACKEND_AUTOLOAD", raising=False)
    monkeypatch.setattr(
        module, "_runtime_components", lambda: pytest.fail("default autoload reached")
    )
    with pytest.raises(module.CandidateRejected, match="runtime_environment"):
        module.load_umxhq_candidate(*candidate_inputs(module))


@pytest.mark.parametrize("container", [None, [], OrderedDict()])
def test_non_plain_checkpoint_container_is_rejected(container):
    module = candidate_module()
    _, receipts = candidate_inputs(module)
    with pytest.raises(module.CandidateRejected, match="stem_set"):
        module.load_umxhq_candidate(container, receipts)


def test_missing_reference_package_is_not_installed_implicitly(monkeypatch):
    module = candidate_module()

    def unavailable(name):
        raise module.PackageNotFoundError(name)

    monkeypatch.setattr(module, "package_version", unavailable)
    with pytest.raises(module.CandidateRejected, match="runtime_unavailable"):
        module.load_umxhq_candidate(*candidate_inputs(module))


def test_missing_torch_runtime_fails_without_fallback(monkeypatch):
    import builtins

    module = candidate_module()
    install_fake_runtime(monkeypatch, module)
    original_import = builtins.__import__

    def unavailable(name, *args, **kwargs):
        if name == "torch":
            raise ImportError("optional inference stack unavailable")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", unavailable)
    with pytest.raises(module.CandidateRejected, match="runtime_unavailable"):
        module.load_umxhq_candidate(*candidate_inputs(module))


def test_inference_exception_has_bounded_diagnostic(monkeypatch):
    module = candidate_module()
    install_fake_runtime(monkeypatch, module)
    separator = module.load_umxhq_candidate(*candidate_inputs(module))

    def fail(self, audio):
        raise RuntimeError("untrusted implementation diagnostic")

    monkeypatch.setattr(FakeSeparator, "__call__", fail)
    with pytest.raises(module.CandidateRejected, match="candidate_inference_rejected"):
        module.separate_umxhq_candidate(separator, np.zeros((2, 4096), dtype=np.float32), 44100)


def test_tensor_ordered_dict_is_supported_without_relaxing_key_validation(monkeypatch):
    module = candidate_module()
    torch, _, state = install_fake_runtime(monkeypatch, module)
    torch.load = lambda *args, **kwargs: OrderedDict(state)
    separator = module.load_umxhq_candidate(*candidate_inputs(module))
    assert tuple(separator.target_models) == module.CANONICAL_STEMS


@pytest.mark.parametrize("problem", ["dtype", "container"])
def test_output_dtype_and_container_are_not_silently_coerced(monkeypatch, problem):
    module = candidate_module()
    install_fake_runtime(monkeypatch, module)
    separator = module.load_umxhq_candidate(*candidate_inputs(module))
    output = FakeTensor(np.zeros((1, 4, 2, 4096), dtype=np.float64))
    if problem == "container":
        output.numpy = lambda: []
    separator.output_override = output
    with pytest.raises(module.CandidateRejected, match="output_contract"):
        module.separate_umxhq_candidate(separator, np.zeros((2, 4096), dtype=np.float32), 44100)
