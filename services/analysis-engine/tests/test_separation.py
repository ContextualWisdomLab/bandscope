"""Tests for the source separation module."""

from __future__ import annotations

import hashlib
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from pathlib import Path
from threading import Event, Lock
from types import ModuleType, SimpleNamespace

import numpy as np
import pytest
import soundfile as sf
from conftest import make_symlink_or_skip

from bandscope_analysis.separation import audio_separator as audio_separator_module
from bandscope_analysis.separation.audio_separator import (
    AudioSeparationConfig,
    AudioStemSeparator,
)
from bandscope_analysis.separation.model import StemCategory
from bandscope_analysis.separation.separator import StemSeparator, _categorize_role


def test_stem_category_enum() -> None:
    """Verify StemCategory enum values match the domain requirements."""
    assert StemCategory.VOCALS.value == "vocals"
    assert StemCategory.BASS.value == "bass"
    assert StemCategory.DRUMS.value == "drums"
    assert StemCategory.KEYS.value == "keys"
    assert StemCategory.GUITAR.value == "guitar"
    assert StemCategory.OTHER.value == "other"


def test_categorize_role_vocal() -> None:
    """Test vocal role type is categorized correctly."""
    assert _categorize_role("lead-vocal", "Lead Vocal", "vocal") == StemCategory.VOCALS


def test_categorize_role_bass() -> None:
    """Test bass instrument role is categorized correctly."""
    assert _categorize_role("bass-guitar", "Bass Guitar", "instrument") == StemCategory.BASS


def test_categorize_role_keys() -> None:
    """Test keyboard role is categorized correctly."""
    assert _categorize_role("keys-right", "Keyboard 1 Right Hand", "hand") == StemCategory.KEYS


def test_categorize_role_piano() -> None:
    """Test piano role is categorized correctly."""
    assert _categorize_role("piano-1", "Piano", "instrument") == StemCategory.KEYS


def test_categorize_role_guitar() -> None:
    """Test guitar role is categorized correctly."""
    assert _categorize_role("guitar-1", "Electric Guitar", "instrument") == StemCategory.GUITAR


def test_categorize_role_drums() -> None:
    """Test drum role is categorized correctly."""
    assert _categorize_role("drum-kit", "Drum Kit", "instrument") == StemCategory.DRUMS


def test_categorize_role_other() -> None:
    """Test unknown role type is categorized as other."""
    assert _categorize_role("synth-pad", "Synth Pad", "instrument") == StemCategory.OTHER


def test_stem_separator_empty() -> None:
    """Test separator with empty roles list."""
    separator = StemSeparator()
    result = separator.separate([])
    assert result["stems"] == []
    assert "0 roles" in result["separation_notes"]


def test_stem_separator_basic() -> None:
    """Test separator with typical roles."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "lead-vocal", "name": "Lead Vocal", "roleType": "vocal"},
        {"id": "keys-right", "name": "Keyboard Right Hand", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 3
    stems_by_id = {s["stem_id"]: s for s in result["stems"]}
    assert stems_by_id["stem-bass-guitar"]["category"] == "bass"
    assert stems_by_id["stem-lead-vocal"]["category"] == "vocals"
    assert stems_by_id["stem-keys-right"]["category"] == "keys"


def test_stem_separator_deduplicates() -> None:
    """Test separator deduplicates roles by id."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1


def test_stem_separator_invalid_role() -> None:
    """Test separator handles non-dict roles gracefully."""
    separator = StemSeparator()
    result = separator.separate(  # type: ignore[arg-type]
        [{"id": "bass", "name": "Bass", "roleType": "instrument"}, "invalid"]
    )
    assert len(result["stems"]) == 1


def test_stem_separator_confidence() -> None:
    """Test confidence levels based on role types."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "keys-left", "name": "Keys Left", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    # instrument gets high, hand gets medium
    assert result["stems"][0]["confidence"] == "high"
    assert result["stems"][1]["confidence"] == "medium"


def test_stem_separator_missing_role_fields() -> None:
    """Test separator handles roles with missing fields."""
    separator = StemSeparator()
    roles = [{"id": "unknown-1"}]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1
    assert result["stems"][0]["category"] == "other"
    # When name is missing, label falls back to role id
    assert result["stems"][0]["label"] == "unknown-1"


def test_stem_separator_keyboard_name_match() -> None:
    """Test separator categorizes keyboard by name even without keys in id."""
    separator = StemSeparator()
    roles = [{"id": "synth-1", "name": "Keyboard Part", "roleType": "instrument"}]
    result = separator.separate(roles)
    assert result["stems"][0]["category"] == "keys"


def test_stem_separator_missing_id() -> None:
    """Test separator handles roles with missing id by generating a fallback id."""
    separator = StemSeparator()
    roles = [{"name": "Lead Vocal", "roleType": "vocal"}]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1
    assert result["stems"][0]["stem_id"] == "stem-role-0"
    assert result["stems"][0]["label"] == "Lead Vocal"


# --- AudioStemSeparator (Demucs) -------------------------------------------------

_DEMUCS_SOURCES = ["drums", "bass", "other", "vocals"]


class _FakeModel:
    """Stand-in for a loaded Demucs model with the htdemucs source order."""

    sources = _DEMUCS_SOURCES

    def eval(self) -> "_FakeModel":
        """Match the torch eval() call site; returns self."""
        return self


class _FakeTensor:
    """Tiny torch.Tensor stand-in for exercising the Demucs apply boundary."""

    def __init__(self, array: np.ndarray) -> None:
        self.array = np.asarray(array, dtype=np.float32)

    def float(self) -> "_FakeTensor":
        """Match torch.Tensor.float()."""
        return _FakeTensor(self.array.astype(np.float32))

    def mean(self, axis: int | None = None) -> float | "_FakeTensor":
        """Return scalar means or tensor means like the torch call sites need."""
        value = self.array.mean(axis=axis)
        if axis is None:
            return float(value)
        return _FakeTensor(np.asarray(value, dtype=np.float32))

    def std(self) -> float:
        """Return the scalar standard deviation used for Demucs normalization."""
        return float(self.array.std())

    def numpy(self) -> np.ndarray:
        """Return the wrapped numpy array."""
        return self.array

    def __getitem__(self, key: object) -> "_FakeTensor":
        return _FakeTensor(self.array[key])

    def __add__(self, value: float) -> "_FakeTensor":
        return _FakeTensor(self.array + value)

    def __sub__(self, value: float) -> "_FakeTensor":
        return _FakeTensor(self.array - value)

    def __mul__(self, value: float) -> "_FakeTensor":
        return _FakeTensor(self.array * value)

    def __truediv__(self, value: float) -> "_FakeTensor":
        return _FakeTensor(self.array / value)


class _FakeNoGrad:
    """Context manager stand-in for torch.no_grad()."""

    def __enter__(self) -> None:
        return None

    def __exit__(self, *args: object) -> None:
        return None


def _install_fake_verified_model_deserializer(
    monkeypatch: pytest.MonkeyPatch,
    *,
    torch_hub_root: object | None = None,
    torch_load: object | None = None,
) -> dict[str, object]:
    """Install fake torch/Demucs deserializers and return captured calls."""
    calls: dict[str, object] = {
        "torch_load_count": 0,
        "demucs_load_count": 0,
        "safe_globals_active": False,
    }
    fake_torch = ModuleType("torch")
    if torch_hub_root is not None:
        fake_torch.hub = SimpleNamespace(get_dir=lambda: torch_hub_root)  # type: ignore[attr-defined]

    class FakeSafeGlobals:
        """Capture and model the scoped PyTorch safe-global allowlist."""

        def __init__(self, globals_to_allow: list[object]) -> None:
            calls["safe_globals"] = tuple(globals_to_allow)

        def __enter__(self) -> None:
            calls["safe_globals_active"] = True

        def __exit__(self, *args: object) -> None:
            calls["safe_globals_active"] = False

    fake_torch.serialization = SimpleNamespace(  # type: ignore[attr-defined]
        safe_globals=FakeSafeGlobals
    )

    def default_torch_load(
        stream: object,
        *,
        map_location: str,
        weights_only: bool,
    ) -> dict[str, object]:
        calls["torch_load_count"] = int(calls["torch_load_count"]) + 1
        calls["payload"] = stream.read()  # type: ignore[attr-defined]
        calls["map_location"] = map_location
        calls["weights_only"] = weights_only
        calls["safe_globals_active_at_load"] = calls["safe_globals_active"]
        return {"verified": True}

    fake_torch.load = torch_load or default_torch_load  # type: ignore[attr-defined]
    demucs_module = ModuleType("demucs")
    htdemucs_module = ModuleType("demucs.htdemucs")
    states_module = ModuleType("demucs.states")

    class HTDemucs:
        """Stand in for the one model class the checkpoint may reconstruct."""

    HTDemucs.__module__ = "demucs.htdemucs"
    htdemucs_module.HTDemucs = HTDemucs  # type: ignore[attr-defined]

    def fake_load_model(package: object, *, strict: bool) -> _FakeModel:
        calls["demucs_load_count"] = int(calls["demucs_load_count"]) + 1
        calls["package"] = package
        calls["strict"] = strict
        return _FakeModel()

    states_module.load_model = fake_load_model  # type: ignore[attr-defined]
    demucs_module.htdemucs = htdemucs_module  # type: ignore[attr-defined]
    demucs_module.states = states_module  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "demucs", demucs_module)
    monkeypatch.setitem(sys.modules, "demucs.htdemucs", htdemucs_module)
    monkeypatch.setitem(sys.modules, "demucs.states", states_module)
    return calls


def _patch_model_spec(
    monkeypatch: pytest.MonkeyPatch,
    *,
    filename: str,
    payload: bytes,
) -> None:
    """Replace the htdemucs manifest with a small exact test artifact."""
    spec = audio_separator_module._ModelArtifactSpec(
        signature="test-signature",
        filename=filename,
        sha256=hashlib.sha256(payload).hexdigest(),
        size_bytes=len(payload),
    )
    monkeypatch.setitem(audio_separator_module._MODEL_ARTIFACTS, "htdemucs", spec)


def test_audio_stem_separator_verifies_exact_model_bytes_before_deserialization(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Deserialize only the exact inventoried bytes and cache the loaded model."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    cache_dir = tmp_path / "torch-hub" / "checkpoints"
    cache_dir.mkdir(parents=True)
    (cache_dir / filename).write_bytes(payload)
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    calls = _install_fake_verified_model_deserializer(
        monkeypatch,
        torch_hub_root=tmp_path / "torch-hub",
    )
    separator = AudioStemSeparator()

    first_model = separator._load_model()
    second_model = separator._load_model()

    assert first_model is second_model
    assert calls["torch_load_count"] == 1
    assert calls["demucs_load_count"] == 1
    assert calls["payload"] == payload
    assert calls["map_location"] == "cpu"
    assert calls["weights_only"] is True
    assert calls["safe_globals_active_at_load"] is True
    assert calls["safe_globals_active"] is False
    assert calls["package"] == {"verified": True}
    assert calls["strict"] is True

    safe_globals = calls["safe_globals"]
    assert isinstance(safe_globals, tuple)
    explicit_names = {
        value[1]
        for value in safe_globals
        if isinstance(value, tuple) and len(value) == 2 and isinstance(value[1], str)
    }
    assert explicit_names == {"numpy.core.multiarray.scalar", "numpy.dtype"}
    assert Fraction in safe_globals
    assert type(np.dtype(np.float64)) in safe_globals
    assert any(
        getattr(value, "__module__", "") == "demucs.htdemucs"
        and getattr(value, "__name__", "") == "HTDemucs"
        for value in safe_globals
    )


def test_audio_stem_separator_serializes_checkpoint_deserialization(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Deserialize once when two callers race the same lazy model instance."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    (tmp_path / filename).write_bytes(payload)
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    first_started = Event()
    second_started = Event()
    release_first = Event()
    counter_lock = Lock()
    load_count = 0
    read_count = 0
    read_lock = Lock()
    verified_read = audio_separator_module._read_verified_model_artifact

    def counted_verified_read(*args: object, **kwargs: object) -> bytes:
        nonlocal read_count
        with read_lock:
            read_count += 1
        return verified_read(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(
        audio_separator_module,
        "_read_verified_model_artifact",
        counted_verified_read,
    )

    def blocking_torch_load(
        stream: object,
        *,
        map_location: str,
        weights_only: bool,
    ) -> dict[str, object]:
        nonlocal load_count
        del stream, map_location, weights_only
        with counter_lock:
            load_count += 1
            call_number = load_count
        if call_number == 1:
            first_started.set()
            assert release_first.wait(timeout=5)
        else:
            second_started.set()
        return {"verified": True}

    _install_fake_verified_model_deserializer(
        monkeypatch,
        torch_load=blocking_torch_load,
    )
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(separator._load_model)
        assert first_started.wait(timeout=5)
        second = executor.submit(separator._load_model)
        assert not second_started.wait(timeout=0.2)
        release_first.set()
        first_model = first.result(timeout=5)
        second_model = second.result(timeout=5)

    assert first_model is second_model
    assert load_count == 1
    assert read_count == 1


@pytest.mark.parametrize(
    ("payload", "error_pattern"),
    [
        (None, "not provisioned"),
        (b"short", "byte size"),
        (b"tampered-model-package", "SHA-256"),
    ],
)
def test_audio_stem_separator_rejects_missing_or_changed_model_before_deserialization(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    payload: bytes | None,
    error_pattern: str,
) -> None:
    """Fail closed for missing, truncated, or substituted checkpoint bytes."""
    trusted_payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    if payload is not None and error_pattern == "SHA-256":
        payload = payload.ljust(len(trusted_payload), b"!")[: len(trusted_payload)]
    _patch_model_spec(monkeypatch, filename=filename, payload=trusted_payload)
    cache_dir = tmp_path / "checkpoints"
    cache_dir.mkdir()
    if payload is not None:
        (cache_dir / filename).write_bytes(payload)

    def forbidden_torch_load(*args: object, **kwargs: object) -> object:
        raise AssertionError("unverified bytes reached the checkpoint loader")

    _install_fake_verified_model_deserializer(
        monkeypatch,
        torch_load=forbidden_torch_load,
    )
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=cache_dir))

    with pytest.raises(ValueError, match=error_pattern):
        separator._load_model()


def test_audio_stem_separator_rejects_symlinked_model_artifact(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject a cache symlink before reading or deserializing its target."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    cache_dir = tmp_path / "checkpoints"
    cache_dir.mkdir()
    target = tmp_path / "outside.th"
    target.write_bytes(payload)
    make_symlink_or_skip(cache_dir / filename, target)
    _install_fake_verified_model_deserializer(monkeypatch)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=cache_dir))

    with pytest.raises(ValueError, match="symlink"):
        separator._load_model()


def test_audio_stem_separator_rejects_nonregular_model_artifact(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject a directory masquerading as the inventoried checkpoint file."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    cache_dir = tmp_path / "checkpoints"
    cache_dir.mkdir()
    (cache_dir / filename).mkdir()
    _install_fake_verified_model_deserializer(monkeypatch)

    def forbidden_open(*args: object, **kwargs: object) -> int:
        raise AssertionError("nonregular cache entry reached os.open")

    monkeypatch.setattr(audio_separator_module.os, "open", forbidden_open)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=cache_dir))

    with pytest.raises(ValueError, match="regular file"):
        separator._load_model()


def test_audio_stem_separator_rejects_opened_file_identity_race(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Re-check the opened descriptor instead of trusting path metadata alone."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    (tmp_path / filename).write_bytes(payload)
    _install_fake_verified_model_deserializer(monkeypatch)
    monkeypatch.setattr(
        audio_separator_module.os,
        "fstat",
        lambda _descriptor: SimpleNamespace(st_mode=0, st_size=len(payload)),
    )
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with pytest.raises(ValueError, match="regular file"):
        separator._load_model()


def test_audio_stem_separator_redacts_model_cache_open_errors(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Redact cache paths when an exact checkpoint cannot be opened safely."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    (tmp_path / filename).write_bytes(payload)
    _install_fake_verified_model_deserializer(monkeypatch)

    def fail_open(*args: object, **kwargs: object) -> int:
        raise PermissionError(f"permission denied under {tmp_path}")

    monkeypatch.setattr(audio_separator_module.os, "open", fail_open)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with pytest.raises(ValueError, match="could not be opened securely") as error:
        separator._load_model()
    assert str(tmp_path) not in str(error.value)


def test_audio_stem_separator_redacts_model_cache_lstat_errors(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Redact cache paths when pre-open metadata lookup fails closed."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    artifact_path = tmp_path / filename
    artifact_path.write_bytes(payload)
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    _install_fake_verified_model_deserializer(monkeypatch)
    original_lstat = Path.lstat

    def fail_lstat(self: Path) -> os.stat_result:
        if self == artifact_path:
            raise PermissionError(f"permission denied under {tmp_path}")
        return original_lstat(self)

    monkeypatch.setattr(Path, "lstat", fail_lstat)

    def forbidden_open(*args: object, **kwargs: object) -> int:
        raise AssertionError("failed lstat reached os.open")

    monkeypatch.setattr(audio_separator_module.os, "open", forbidden_open)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with pytest.raises(ValueError, match="could not be opened securely") as error:
        separator._load_model()
    assert str(tmp_path) not in str(error.value)


def test_audio_stem_separator_treats_open_toctou_as_unprovisioned(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep a raced-away checkpoint fail-closed as not provisioned after lstat."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    (tmp_path / filename).write_bytes(payload)
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    _install_fake_verified_model_deserializer(monkeypatch)

    def vanish_on_open(*args: object, **kwargs: object) -> int:
        raise FileNotFoundError("checkpoint vanished after lstat")

    monkeypatch.setattr(audio_separator_module.os, "open", vanish_on_open)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with pytest.raises(ValueError, match="not provisioned"):
        separator._load_model()


def test_audio_stem_separator_redacts_model_cache_fstat_errors(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Close the descriptor and redact paths when post-open fstat fails."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    (tmp_path / filename).write_bytes(payload)
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    _install_fake_verified_model_deserializer(monkeypatch)
    close_count = 0
    original_close = audio_separator_module.os.close

    def counted_close(descriptor: int) -> None:
        nonlocal close_count
        close_count += 1
        original_close(descriptor)

    def fail_fstat(_descriptor: int) -> os.stat_result:
        raise OSError(f"fstat failed under {tmp_path}")

    monkeypatch.setattr(audio_separator_module.os, "fstat", fail_fstat)
    monkeypatch.setattr(audio_separator_module.os, "close", counted_close)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with pytest.raises(ValueError, match="could not be opened securely") as error:
        separator._load_model()
    assert str(tmp_path) not in str(error.value)
    assert close_count == 1


def test_audio_stem_separator_redacts_default_cache_location_errors(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Redact torch cache details when its default location cannot be resolved."""
    calls = _install_fake_verified_model_deserializer(monkeypatch)
    fake_torch = sys.modules["torch"]

    def fail_get_dir() -> object:
        raise RuntimeError(f"unsafe cache detail under {tmp_path}")

    fake_torch.hub = SimpleNamespace(get_dir=fail_get_dir)  # type: ignore[attr-defined]
    separator = AudioStemSeparator()

    with pytest.raises(ValueError, match="cache location is unavailable") as error:
        separator._load_model()
    assert str(tmp_path) not in str(error.value)
    assert calls["torch_load_count"] == 0
    assert calls["demucs_load_count"] == 0


def test_audio_stem_separator_uses_explicit_model_path_from_environment(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bind operator-provided model paths to the same exact-byte loader."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    artifact_path = tmp_path / filename
    artifact_path.write_bytes(payload)
    monkeypatch.setenv("BANDSCOPE_HTDEMUCS_MODEL_PATH", str(artifact_path))
    calls = _install_fake_verified_model_deserializer(monkeypatch)

    separator = AudioStemSeparator()

    assert separator._load_model() is not None
    assert calls["payload"] == payload


def test_audio_stem_separator_rejects_wrong_explicit_model_filename(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep explicit paths bound to the inventoried checkpoint filename."""
    payload = b"verified-model-package"
    _patch_model_spec(monkeypatch, filename="expected-model.th", payload=payload)
    artifact_path = tmp_path / "substituted-model.th"
    artifact_path.write_bytes(payload)
    monkeypatch.setenv("BANDSCOPE_HTDEMUCS_MODEL_PATH", str(artifact_path))
    calls = _install_fake_verified_model_deserializer(monkeypatch)

    separator = AudioStemSeparator()

    with pytest.raises(ValueError, match="inventoried filename"):
        separator._load_model()
    assert calls["torch_load_count"] == 0


def test_audio_stem_separator_rejects_uninventoried_model(tmp_path) -> None:
    """Refuse arbitrary model names that have no exact artifact manifest."""
    separator = AudioStemSeparator(
        AudioSeparationConfig(
            model_name="untrusted-model",
            model_cache_directory=tmp_path,
        )
    )

    with pytest.raises(ValueError, match="not inventoried"):
        separator._load_model()


def test_audio_stem_separator_redacts_verified_model_load_errors(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Surface a stable error when exact verified bytes still fail to deserialize."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    (tmp_path / filename).write_bytes(payload)

    def fail_torch_load(*args: object, **kwargs: object) -> object:
        raise RuntimeError(f"unsafe detail under {tmp_path}")

    calls = _install_fake_verified_model_deserializer(monkeypatch, torch_load=fail_torch_load)
    separator = AudioStemSeparator(AudioSeparationConfig(model_cache_directory=tmp_path))

    with pytest.raises(ValueError, match="failed to load after integrity verification") as error:
        separator._load_model()
    assert str(tmp_path) not in str(error.value)
    assert calls["safe_globals_active"] is False


def _patch_demucs(monkeypatch: pytest.MonkeyPatch, per_source: dict | None = None) -> None:
    """Patch the Demucs boundary so separation runs without the real model.

    ``per_source`` optionally maps a demucs source name to a mono numpy array to
    return for that stem; unspecified sources return silence.
    """

    def fake_apply_model(
        self: AudioStemSeparator, model: _FakeModel, audio: np.ndarray
    ) -> dict[str, np.ndarray]:
        samples = int(audio.size)
        out = {name: np.zeros(samples, dtype=np.float32) for name in _DEMUCS_SOURCES}
        if per_source:
            for name in _DEMUCS_SOURCES:
                if name in per_source:
                    row = per_source[name].astype(np.float32)
                    copy_length = min(samples, int(row.size))
                    out[name][:copy_length] = row[:copy_length]
        return out

    monkeypatch.setattr(AudioStemSeparator, "_load_model", lambda self: _FakeModel())
    monkeypatch.setattr(AudioStemSeparator, "_apply_model", fake_apply_model)


def test_audio_stem_separator_splits_local_audio_into_canonical_stems(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ensure local audio is separated into downstream-consumable canonical stems."""
    _patch_demucs(monkeypatch)
    sample_rate = 8_000
    duration_seconds = 0.5
    samples = int(sample_rate * duration_seconds)
    times = np.arange(samples, dtype=np.float32) / sample_rate
    mix = (0.35 * np.sin(2 * np.pi * 82.0 * times)).astype(np.float32)
    audio_path = tmp_path / "rehearsal.wav"
    sf.write(audio_path, mix, sample_rate)

    separator = AudioStemSeparator(
        AudioSeparationConfig(
            target_sample_rate=sample_rate,
            max_duration_seconds=1.0,
            max_file_bytes=1_000_000,
        )
    )
    result = separator.separate(audio_path)

    assert set(result["stems"]) == {"vocals", "bass", "drums", "other"}
    assert result["sample_rate"] == sample_rate
    assert result["duration_seconds"] == pytest.approx(duration_seconds)
    assert result["stem_role_types"] == {
        "vocals": "vocal",
        "bass": "instrument",
        "drums": "instrument",
        "other": "instrument",
    }
    assert "htdemucs" in result["separation_notes"]
    assert str(tmp_path) not in result["separation_notes"]
    for stem in result["stems"].values():
        assert stem.shape == (samples,)
        assert np.isfinite(stem).all()


def test_audio_stem_separator_maps_demucs_sources_to_named_stems(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ensure each Demucs source lands in its correctly named stem, not by position."""
    sample_rate = 8_000
    samples = 4_000
    marker = np.ones(samples, dtype=np.float32)
    _patch_demucs(monkeypatch, per_source={"bass": marker})
    audio_path = tmp_path / "mix.wav"
    times = np.arange(samples, dtype=np.float32) / sample_rate
    sf.write(audio_path, (0.5 * np.sin(2 * np.pi * 82.0 * times)).astype(np.float32), sample_rate)

    separator = AudioStemSeparator(
        AudioSeparationConfig(target_sample_rate=sample_rate, max_file_bytes=1_000_000)
    )
    result = separator.separate(audio_path)

    # The 'bass' demucs source must land in the 'bass' stem (by name, not position);
    # the silent 'vocals' source stays negligible relative to it.
    bass_peak = float(np.max(np.abs(result["stems"]["bass"])))
    vocals_peak = float(np.max(np.abs(result["stems"]["vocals"])))
    assert bass_peak > 0.1
    assert vocals_peak < bass_peak * 0.01


def test_audio_stem_separator_caches_model(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the model is loaded once and reused across calls."""
    payload = b"verified-model-package"
    filename = "test-signature-deadbeef.th"
    _patch_model_spec(monkeypatch, filename=filename, payload=payload)
    (tmp_path / filename).write_bytes(payload)
    calls = _install_fake_verified_model_deserializer(monkeypatch)

    def fake_apply_model(
        self: AudioStemSeparator, model: _FakeModel, audio: np.ndarray
    ) -> dict[str, np.ndarray]:
        return {name: np.zeros(audio.size, dtype=np.float32) for name in _DEMUCS_SOURCES}

    monkeypatch.setattr(AudioStemSeparator, "_apply_model", fake_apply_model)

    audio_path = tmp_path / "mix.wav"
    sf.write(audio_path, np.zeros(4_000, dtype=np.float32), 8_000)
    separator = AudioStemSeparator(
        AudioSeparationConfig(
            target_sample_rate=8_000,
            max_file_bytes=1_000_000,
            model_cache_directory=tmp_path,
        )
    )
    separator.separate(audio_path)
    separator.separate(audio_path)
    assert calls["torch_load_count"] == 1
    assert calls["demucs_load_count"] == 1


def test_audio_stem_separator_apply_model_uses_demucs_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure Demucs receives normalized stereo input and returns mono stems by source."""
    calls: dict[str, object] = {}
    samples = 4

    fake_torch = ModuleType("torch")
    fake_torch.from_numpy = _FakeTensor  # type: ignore[attr-defined]
    fake_torch.no_grad = _FakeNoGrad  # type: ignore[attr-defined]

    def fake_apply_model(
        model: _FakeModel,
        batch: _FakeTensor,
        *,
        device: str,
        shifts: int,
        split: bool,
        overlap: float,
        progress: bool,
    ) -> _FakeTensor:
        calls.update(
            {
                "batch_shape": batch.array.shape,
                "device": device,
                "shifts": shifts,
                "split": split,
                "overlap": overlap,
                "progress": progress,
            }
        )
        source_values = np.arange(len(model.sources), dtype=np.float32).reshape(-1, 1, 1)
        separated = np.broadcast_to(source_values, (len(model.sources), 2, samples)).copy()
        return _FakeTensor(separated[None])

    demucs_module = ModuleType("demucs")
    apply_module = ModuleType("demucs.apply")
    apply_module.apply_model = fake_apply_model  # type: ignore[attr-defined]
    demucs_module.apply = apply_module  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "demucs", demucs_module)
    monkeypatch.setitem(sys.modules, "demucs.apply", apply_module)

    audio = np.array([0.0, 1.0, -1.0, 0.5], dtype=np.float32)
    separator = AudioStemSeparator(AudioSeparationConfig(device="cpu", overlap=0.375))
    result = separator._apply_model(_FakeModel(), audio)

    ref = np.stack([audio, audio])
    ref_mean = float(ref.mean())
    ref_std = float(ref.std()) + 1e-9
    assert calls == {
        "batch_shape": (1, 2, samples),
        "device": "cpu",
        "shifts": 0,
        "split": True,
        "overlap": 0.375,
        "progress": False,
    }
    for index, source in enumerate(_DEMUCS_SOURCES):
        expected = np.full(samples, index * ref_std + ref_mean, dtype=np.float32)
        np.testing.assert_allclose(result[source], expected)


def test_audio_stem_separator_rejects_missing_audio_file(tmp_path) -> None:
    """Ensure missing local files fail before decode without leaking a full path."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))
    with pytest.raises(FileNotFoundError, match="Audio file not found: missing.wav"):
        separator.separate(tmp_path / "missing.wav")


def test_audio_stem_separator_rejects_parent_traversal_in_audio_file(tmp_path) -> None:
    """Ensure parent path segments are rejected before source path resolution."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Path traversal attempt detected"):
        separator.separate(tmp_path / "nested" / ".." / "rehearsal.wav")


def test_audio_stem_separator_rejects_altsep_parent_traversal_in_audio_file() -> None:
    """Ensure backslash traversal is rejected on non-Windows hosts."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Path traversal attempt detected"):
        separator.separate("safe\\..\\rehearsal.wav")


@pytest.mark.parametrize(
    "audio_path",
    ["safe/..\\rehearsal.wav", "safe\\../rehearsal.wav"],
)
def test_audio_stem_separator_rejects_mixed_separator_parent_traversal(
    audio_path: str,
) -> None:
    """Ensure mixed-separator traversal is rejected before path resolution."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Path traversal attempt detected"):
        separator.separate(audio_path)


def test_audio_stem_separator_rejects_directory_source(tmp_path) -> None:
    """Ensure directories are not accepted as audio files."""
    source_dir = tmp_path / "source-dir"
    source_dir.mkdir()
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))
    with pytest.raises(FileNotFoundError, match="Audio file not found: source-dir"):
        separator.separate(source_dir)


def test_audio_stem_separator_rejects_oversized_audio_file(tmp_path) -> None:
    """Ensure local audio intake enforces a bounded file-size limit."""
    audio_path = tmp_path / "too-large.wav"
    audio_path.write_bytes(b"0" * 16)
    separator = AudioStemSeparator(
        AudioSeparationConfig(target_sample_rate=8_000, max_file_bytes=8)
    )
    with pytest.raises(ValueError, match="Audio file is too large for stem separation"):
        separator.separate(audio_path)


def test_audio_stem_separator_rejects_empty_decoder_output(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure empty decoder output fails safely."""
    audio_path = tmp_path / "empty.wav"
    audio_path.write_bytes(b"placeholder")
    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.librosa.load",
        lambda *args, **kwargs: (np.array([], dtype=np.float32), 8_000),
    )
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))
    with pytest.raises(ValueError, match="Stem separation decode failed for empty.wav"):
        separator.separate(audio_path)


def test_audio_stem_separator_redacts_decoder_exceptions(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure decoder failures are surfaced without full local paths."""
    audio_path = tmp_path / "broken.wav"
    audio_path.write_bytes(b"placeholder")

    def fail_decode(*args, **kwargs):
        raise RuntimeError(f"decoder failed under {tmp_path}")

    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.librosa.load",
        fail_decode,
    )
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))
    with pytest.raises(ValueError, match="Stem separation decode failed for broken.wav") as error:
        separator.separate(audio_path)
    assert str(tmp_path) not in str(error.value)


def test_audio_stem_separator_fit_length_zero() -> None:
    """Ensure zero-length targets stay bounded and return an empty stem."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    fitted = separator._fit_length(np.ones(4, dtype=np.float32), 0)

    assert fitted.shape == (0,)


@pytest.mark.skipif(
    os.environ.get("BANDSCOPE_RUN_DEMUCS") != "1",
    reason="real Demucs run is slow and needs local model weights; set BANDSCOPE_RUN_DEMUCS=1",
)
def test_audio_stem_separator_real_demucs_isolates_bass(tmp_path) -> None:
    """Integration: real Demucs isolates a bass line far better than the old mock.

    Validated manually at ~+22.7 dB SI-SDR (vs -39 dB for the previous FFT mock).
    """
    sample_rate = 44_100
    t = np.arange(int(sample_rate * 6)) / sample_rate
    bass = 0.5 * np.sin(2 * np.pi * 82.41 * t)
    other = 0.3 * (np.sin(2 * np.pi * 261.63 * t) + np.sin(2 * np.pi * 329.63 * t))
    mix = (bass + other).astype(np.float32)
    audio_path = tmp_path / "mix.wav"
    sf.write(audio_path, mix, sample_rate)

    separator = AudioStemSeparator(AudioSeparationConfig(max_file_bytes=50_000_000))
    stems = separator.separate(audio_path)["stems"]

    def sisdr(est: np.ndarray, ref: np.ndarray) -> float:
        ref = ref - ref.mean()
        est = est - est.mean()
        a = np.dot(est, ref) / (np.dot(ref, ref) + 1e-9)
        proj = a * ref
        return 10 * np.log10((np.dot(proj, proj) + 1e-9) / (np.dot(est - proj, est - proj) + 1e-9))

    n = min(len(stems["bass"]), len(bass))
    assert sisdr(stems["bass"][:n], bass[:n]) > 5.0


def test_audio_stem_separator_unavailable_platform(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Platforms without demucs/torch degrade with a clear, safe error."""
    import builtins

    real_import = builtins.__import__

    def no_demucs(name: str, *args: object, **kwargs: object) -> object:
        if name.startswith("demucs"):
            raise ImportError("No module named 'demucs'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_demucs)
    audio_path = tmp_path / "mix.wav"
    sf.write(audio_path, np.zeros(4_000, dtype=np.float32), 8_000)
    separator = AudioStemSeparator(
        AudioSeparationConfig(target_sample_rate=8_000, max_file_bytes=1_000_000)
    )
    with pytest.raises(ValueError, match="not available on this platform"):
        separator.separate(audio_path)
