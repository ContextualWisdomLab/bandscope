"""PCM, exact-model and upstream inference parity tests for Basic Pitch drafts."""

from __future__ import annotations

import base64
import hashlib
import importlib
import io
import pathlib
import socket
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest

from bandscope_analysis.audio_resource_policy import AudioResourcePolicyError
from bandscope_analysis.transcription import basic_pitch_backend as backend
from bandscope_analysis.transcription.midi import TranscriptionError


def _pcm(seconds: float = 1) -> np.ndarray:
    """Generate a deterministic unit-fixture tone, not a real-music quality benchmark."""
    times = np.arange(int(seconds * backend.SAMPLE_RATE)) / backend.SAMPLE_RATE
    return np.asarray(0.2 * np.sin(2 * np.pi * 220 * times), dtype=np.float32)


def test_installed_onnx_bytes_match_the_reviewed_package_pin() -> None:
    """The installed wheel must supply the independently inspected original model bytes."""
    content = backend._verified_model_bytes()
    assert len(content) == 230444
    assert hashlib.sha256(content).hexdigest() == backend.MODEL_SHA256


def test_actual_onnx_inference_generates_notes_and_parseable_midi_offline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Use actual pinned weights while proving the synthetic unit path needs no sockets."""

    def denied(*_args: object, **_kwargs: object) -> None:
        """Reject any attempted network connection during local inference."""
        raise AssertionError("Unexpected network access")

    monkeypatch.setattr(socket.socket, "connect", denied)
    monkeypatch.setattr(socket.socket, "connect_ex", denied)
    monkeypatch.setattr(socket, "create_connection", denied)
    result = backend.transcribe_pcm(_pcm())
    assert 57 in {note["midiPitch"] for note in result["notes"]}
    assert result["model"]["sha256"] == backend.MODEL_SHA256
    assert result["durationSeconds"] == 1
    mido = importlib.import_module("mido")
    parsed = mido.MidiFile(file=io.BytesIO(base64.b64decode(result["midiBase64"])))
    assert any(message.type == "note_on" and message.velocity for message in parsed.tracks[1])
    assert [message.pitch for message in parsed.tracks[1] if message.type == "pitchwheel"][-1] == 0


@pytest.mark.parametrize("kind", ["short", "oversized", "same_length_corrupt"])
def test_model_checksum_rejects_mutation_before_session_load(
    kind: str, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Length and content checks independently stop modified packaged model bytes."""
    size = {
        "short": 2,
        "oversized": backend.MODEL_BYTES + 1,
        "same_length_corrupt": backend.MODEL_BYTES,
    }[kind]
    model = tmp_path / "nmp.onnx"
    model.write_bytes(b"x" * size)
    fake = SimpleNamespace(version=backend.MODEL_VERSION, locate_file=lambda _path: model)
    monkeypatch.setattr(backend.importlib.metadata, "distribution", lambda _name: fake)
    with pytest.raises(TranscriptionError, match="^model_integrity_failed$"):
        backend.transcribe_pcm(_pcm())


@pytest.mark.parametrize("version", ["0.4.1", "0.4.0"])
def test_unavailable_model_version_or_file_uses_a_stable_error(
    version: str, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No package replacement or missing local file should trigger model acquisition."""
    fake = SimpleNamespace(version=version, locate_file=lambda _path: tmp_path / "missing.onnx")
    monkeypatch.setattr(backend.importlib.metadata, "distribution", lambda _name: fake)
    with pytest.raises(TranscriptionError, match="^model_unavailable$"):
        backend._verified_model_bytes()


def test_silence_checks_model_identity_but_does_not_run_inference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Silent audio returns an empty draft without fabricating notes or running the network."""

    def denied(*_args: object) -> None:
        """Fail if the silent-input fast path starts ONNX inference."""
        raise AssertionError("Silence reached inference")

    monkeypatch.setattr(backend, "_infer_pcm", denied)
    result = backend.transcribe_pcm(np.zeros(backend.SAMPLE_RATE, dtype=np.float32))
    assert result["notes"] == []
    assert base64.b64decode(result["midiBase64"]).startswith(b"MThd")


def test_over_range_pcm_is_explicitly_peak_normalized_without_mutating_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A float recording above unity keeps its relative waveform and reports normalization."""
    original = np.full(100, 2, dtype=np.float32)
    observed: list[np.ndarray] = []

    def infer(audio: np.ndarray, _model: bytes) -> dict[str, np.ndarray]:
        """Observe the admitted derived PCM and return a no-activity unit output."""
        observed.append(audio)
        return {
            name: np.zeros((1, bins), dtype=np.float32)
            for name, bins in backend._OUTPUT_BINS.items()
        }

    monkeypatch.setattr(backend, "_infer_pcm", infer)
    result = backend.transcribe_pcm(original)
    assert np.all(original == 2)
    assert np.all(observed[0] == 1)
    assert result["warnings"] == ["audio_peak_normalized"]


@pytest.mark.parametrize(
    "audio,rate",
    [
        (np.array([], dtype=np.float32), 22050),
        (np.ones((2, 10), dtype=np.float32), 22050),
        (np.ones(10, dtype=np.float64), 22050),
        (np.ones(10, dtype=np.int16), 22050),
        (np.array([np.nan], dtype=np.float32), 22050),
        (np.array([np.inf], dtype=np.float32), 22050),
        (np.ones(10, dtype=np.float32), 44100),
        (np.ones(10, dtype=np.float32), True),
    ],
)
def test_unadmitted_pcm_never_reaches_model_loading(
    audio: object, rate: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The canonical representation boundary remains authoritative before all model work."""

    def denied() -> bytes:
        """Fail if malformed PCM reaches the model loader."""
        raise AssertionError("Unadmitted PCM reached model")

    monkeypatch.setattr(backend, "_verified_model_bytes", denied)
    with pytest.raises(AudioResourcePolicyError):
        backend.transcribe_pcm(audio, rate)


@pytest.mark.parametrize("value", [np.nan, np.inf, -0.1, 1.1])
def test_model_probabilities_reject_nonfinite_or_out_of_range_values(value: float) -> None:
    """A model-output corruption cannot turn into unbounded or misleading note events."""
    output = np.zeros((2, 88), dtype=np.float32)
    output[0, 0] = value
    with pytest.raises(TranscriptionError, match="^invalid_model_output$"):
        backend._validate_output(output, 2, 88)


@pytest.mark.parametrize("output", [None, np.zeros((2, 88)), np.zeros((2, 87), dtype=np.float32)])
def test_model_shape_and_dtype_are_fixed(output: object) -> None:
    """Wrong output shapes and dtypes fail before concatenation and decoding."""
    with pytest.raises(TranscriptionError, match="^invalid_model_output$"):
        backend._validate_output(output, 2, 88)


def test_pcm_windows_match_upstream_without_using_upstream_audio_decode(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The direct-PCM seam must preserve official padding, stride and overlap removal."""
    inference = importlib.import_module("basic_pitch.inference")
    wavfile = importlib.import_module("scipy.io.wavfile")
    source = _pcm(4)
    path = tmp_path / "synthetic.wav"
    wavfile.write(path, backend.SAMPLE_RATE, source)
    expected = [
        window for window, _, _ in inference.get_audio_input(path, 30 * 256, 43844 - 30 * 256)
    ]
    captured: list[np.ndarray] = []

    class Session:
        """Deterministic fixed-shape model double for window parity only."""

        def run(self, names: list[str], inputs: dict[str, np.ndarray]) -> list[np.ndarray]:
            """Record the actual model input and expose distinguishable window outputs."""
            assert names == [
                "StatefulPartitionedCall:1",
                "StatefulPartitionedCall:2",
                "StatefulPartitionedCall:0",
            ]
            captured.append(inputs["serving_default_input_2:0"])
            return [
                np.full((1, 172, bins), len(captured) / 10, dtype=np.float32)
                for bins in (88, 88, 264)
            ]

    monkeypatch.setattr(backend, "_load_session", lambda _bytes: Session())
    output = backend._infer_pcm(source, b"unit-model")
    assert len(captured) == len(expected)
    assert all(
        np.array_equal(actual, reference)
        for actual, reference in zip(captured, expected, strict=True)
    )
    assert output["note"].shape == (344, 88)
    assert output["contour"].shape == (344, 264)


@pytest.mark.parametrize("prediction", [None, [], [None, None, None]])
def test_inference_rejects_wrong_session_output_contract(
    prediction: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Broken runtime results cannot widen the fixed tensor-output schema."""
    session = SimpleNamespace(run=lambda *_args: prediction)
    monkeypatch.setattr(backend, "_load_session", lambda _bytes: session)
    with pytest.raises(TranscriptionError, match="^invalid_model_output$"):
        backend._infer_pcm(_pcm(), b"unit-model")


@pytest.mark.parametrize("frames", [[(0, 1, 60, 0.5)] * 4097, [(0, 32769, 60, 0.5)]])
def test_note_and_contour_expansion_limits_precede_pitch_bend_allocation(
    frames: list[tuple[int, int, int, float]], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pathological decoded activations fail before contour lists are materialized."""
    creation = importlib.import_module("basic_pitch.note_creation")
    monkeypatch.setattr(creation, "output_to_notes_polyphonic", lambda *_args, **_kwargs: frames)
    outputs = {
        name: np.full((10, bins), 0.5, dtype=np.float32)
        for name, bins in backend._OUTPUT_BINS.items()
    }
    with pytest.raises(TranscriptionError, match="^transcription_too_complex$"):
        backend._decode_notes(outputs)


def test_runtime_initialization_and_unexpected_inference_errors_are_stable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Runtime internals remain private when model initialization or inference fails."""
    runtime = importlib.import_module("onnxruntime")

    def fail(*_args: object, **_kwargs: object) -> Any:
        """Raise a private library diagnostic that must not escape the domain error."""
        raise RuntimeError("/private/local-user/secret-recording.wav")

    monkeypatch.setattr(runtime, "InferenceSession", fail)
    with pytest.raises(TranscriptionError, match="^model_unavailable$"):
        backend._load_session(b"unit-model")
    monkeypatch.setattr(backend, "_infer_pcm", fail)
    with pytest.raises(TranscriptionError, match="^transcription_failed$"):
        backend.transcribe_pcm(_pcm())


def test_domain_inference_failure_keeps_its_specific_code(monkeypatch: pytest.MonkeyPatch) -> None:
    """A bounded-output rejection must not be replaced with an unhelpful generic failure."""

    def fail(*_args: object) -> Any:
        """Reject model output before any MIDI draft can be returned."""
        raise TranscriptionError("invalid_model_output")

    monkeypatch.setattr(backend, "_infer_pcm", fail)
    with pytest.raises(TranscriptionError, match="^invalid_model_output$"):
        backend.transcribe_pcm(_pcm())
