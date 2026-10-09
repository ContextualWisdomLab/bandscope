"""Offline Basic Pitch 0.4.0 adapter for already admitted mono PCM.

The package's fixed ONNX bytes are verified before loading. Spotify's windowing,
overlap removal and note decoder are reused without reopening the source audio.
No path or network capability is exposed by the inference function.
"""

from __future__ import annotations

import base64
import hashlib
import importlib
import importlib.metadata
from typing import Any, TypedDict, cast

import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.audio_resource_policy import AudioResourcePolicy
from bandscope_analysis.transcription.midi import (
    MAX_NOTES,
    MAX_PITCH_BENDS,
    TranscribedNote,
    TranscriptionError,
    TranscriptionWarning,
    build_midi_draft,
)

MODEL_VERSION = "0.4.0"
MODEL_SHA256 = "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec"
MODEL_BYTES = 230444
SAMPLE_RATE = 22050
MAX_DURATION_SECONDS = 120
PCM_POLICY = AudioResourcePolicy(
    max_encoded_file_bytes=50 * 1024 * 1024,
    target_sample_rate=SAMPLE_RATE,
    max_duration_seconds=MAX_DURATION_SECONDS,
    max_decoded_audio_bytes=SAMPLE_RATE * MAX_DURATION_SECONDS * 4,
)
_OUTPUT_BINS = {"note": 88, "onset": 88, "contour": 264}


class ModelIdentity(TypedDict):
    """The exact model identity whose bytes were admitted in this process."""

    name: str
    version: str
    sha256: str


class TranscriptionResult(TypedDict):
    """Bounded path-free payload for the native transcription bridge."""

    schemaVersion: int
    durationSeconds: float
    model: ModelIdentity
    notes: list[TranscribedNote]
    midiBase64: str
    warnings: list[TranscriptionWarning]


def _verified_model_bytes() -> bytes:
    """Read the version-pinned packaged ONNX once and verify the retained bytes."""
    try:
        distribution = importlib.metadata.distribution("basic-pitch")
        if distribution.version != MODEL_VERSION:
            raise TranscriptionError("model_unavailable")
        path = distribution.locate_file("basic_pitch/saved_models/icassp_2022/nmp.onnx")
        with open(str(path), "rb") as source:
            contents = source.read(MODEL_BYTES + 1)
    except TranscriptionError:
        raise
    except Exception as error:
        raise TranscriptionError("model_unavailable") from error
    if len(contents) != MODEL_BYTES or hashlib.sha256(contents).hexdigest() != MODEL_SHA256:
        raise TranscriptionError("model_integrity_failed")
    return contents


def _load_session(model_bytes: bytes) -> Any:
    """Create only the CPU ONNX runtime from the same hash-verified byte snapshot."""
    try:
        runtime = importlib.import_module("onnxruntime")
        options = runtime.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.execution_mode = runtime.ExecutionMode.ORT_SEQUENTIAL
        return runtime.InferenceSession(
            model_bytes, sess_options=options, providers=["CPUExecutionProvider"]
        )
    except Exception as error:
        raise TranscriptionError("model_unavailable") from error


def _validate_output(value: object, frames: int, bins: int) -> NDArray[np.float32]:
    """Admit the fixed model output shape before concatenation or note decoding."""
    if (
        not isinstance(value, np.ndarray)
        or value.dtype != np.dtype(np.float32)
        or value.shape != (frames, bins)
    ):
        raise TranscriptionError("invalid_model_output")
    for start in range(0, frames, 1024):
        chunk = value[start : start + 1024]
        if not np.isfinite(chunk).all() or (chunk < 0).any() or (chunk > 1).any():
            raise TranscriptionError("invalid_model_output")
    return cast(NDArray[np.float32], value)


def _infer_pcm(audio: NDArray[np.float32], model_bytes: bytes) -> dict[str, NDArray[np.float32]]:
    """Reuse upstream windows and overlap removal while retaining the admitted PCM."""
    session = _load_session(model_bytes)
    inference = importlib.import_module("basic_pitch.inference")
    constants = importlib.import_module("basic_pitch.constants")
    overlap_frames = 30
    overlap_samples = overlap_frames * constants.FFT_HOP
    padded = np.concatenate((np.zeros(overlap_samples // 2, dtype=np.float32), audio))
    outputs: dict[str, list[NDArray[np.float32]]] = {name: [] for name in _OUTPUT_BINS}
    for window, _ in inference.window_audio_file(
        padded, constants.AUDIO_N_SAMPLES - overlap_samples
    ):
        prediction = session.run(
            ["StatefulPartitionedCall:1", "StatefulPartitionedCall:2", "StatefulPartitionedCall:0"],
            {"serving_default_input_2:0": np.expand_dims(window, axis=0)},
        )
        if not isinstance(prediction, list) or len(prediction) != 3:
            raise TranscriptionError("invalid_model_output")
        for (name, bins), value in zip(_OUTPUT_BINS.items(), prediction, strict=True):
            if not isinstance(value, np.ndarray) or value.shape != (
                1,
                constants.ANNOT_N_FRAMES,
                bins,
            ):
                raise TranscriptionError("invalid_model_output")
            outputs[name].append(
                np.expand_dims(_validate_output(value[0], constants.ANNOT_N_FRAMES, bins), axis=0)
            )
    frame_count = int(np.floor(audio.size * (constants.ANNOTATIONS_FPS / SAMPLE_RATE)))
    return {
        name: _validate_output(
            inference.unwrap_output(np.concatenate(chunks), audio.size, overlap_frames),
            frame_count,
            _OUTPUT_BINS[name],
        )
        for name, chunks in outputs.items()
    }


def _decode_notes(outputs: dict[str, NDArray[np.float32]]) -> list[Any]:
    """Apply Spotify's note decoder and bound events before expanding pitch contours."""
    creation = importlib.import_module("basic_pitch.note_creation")
    if outputs["note"].shape[0] < 2 or not np.any(outputs["note"] > 0.3):
        return []
    frames = creation.output_to_notes_polyphonic(
        outputs["note"],
        outputs["onset"],
        onset_thresh=0.5,
        frame_thresh=0.3,
        min_note_len=11,
        infer_onsets=True,
        max_freq=None,
        min_freq=None,
        melodia_trick=True,
    )
    if len(frames) > MAX_NOTES or sum(end - start for start, end, _, _ in frames) > MAX_PITCH_BENDS:
        raise TranscriptionError("transcription_too_complex")
    with_bends = creation.get_pitch_bends(outputs["contour"], frames)
    times = creation.model_frames_to_time(outputs["contour"].shape[0])
    return [
        (times[start], times[end], pitch, amplitude, bends)
        for start, end, pitch, amplitude, bends in with_bends
    ]


def transcribe_pcm(audio: object, sample_rate: int = SAMPLE_RATE) -> TranscriptionResult:
    """Create a local MIDI draft from finite, bounded 22.05-kHz mono float32 PCM."""
    admitted = PCM_POLICY.validate_decoded_audio(audio, sample_rate)
    duration = admitted.size / SAMPLE_RATE
    model_bytes = _verified_model_bytes()
    warnings: list[TranscriptionWarning] = []
    peak = float(np.max(np.abs(admitted)))
    if peak > 1:
        admitted = np.asarray(admitted / peak, dtype=np.float32)
        warnings.append("audio_peak_normalized")
    try:
        raw = [] if peak < 1e-5 else _decode_notes(_infer_pcm(admitted, model_bytes))
        notes, midi, midi_warnings = build_midi_draft(raw, duration)
    except TranscriptionError:
        raise
    except Exception as error:
        raise TranscriptionError("transcription_failed") from error
    return {
        "schemaVersion": 1,
        "durationSeconds": duration,
        "model": {"name": "basic-pitch", "version": MODEL_VERSION, "sha256": MODEL_SHA256},
        "notes": notes,
        "midiBase64": base64.b64encode(midi).decode("ascii"),
        "warnings": sorted(set(warnings + midi_warnings)),
    }
