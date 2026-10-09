"""Bounded note admission and single-channel MIDI draft serialization.

Basic Pitch's overlapping-note bend policy is retained. MIDI channel state is
reset at note ends before a touching note establishes its own bend and starts.
JSON uses the same quantized times, velocities, and signed 14-bit wheel values.
"""

from __future__ import annotations

import importlib
import io
import math
from numbers import Integral, Real
from typing import Any, Literal, TypedDict, get_args

import numpy as np

MAX_NOTES = 4096
MAX_PITCH_BENDS = 32768
MAX_MIDI_BYTES = 256 * 1024
_PITCH_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
TranscriptionWarning = Literal[
    "audio_peak_normalized",
    "overlapping_pitch_bends_omitted",
    "note_times_clipped",
    "out_of_range_notes_omitted",
]
WARNING_CODES = frozenset(get_args(TranscriptionWarning))


class TranscriptionError(ValueError):
    """Carry a stable failure code without an input path or library payload."""

    def __init__(self, code: str) -> None:
        """Retain only the caller-facing machine-readable failure code."""
        super().__init__(code)
        self.code = code


class PitchBend(TypedDict):
    """One absolute-time MIDI wheel sample in semitones at a two-semitone range."""

    time: float
    semitones: float


class TranscribedNote(TypedDict):
    """One admitted note whose values agree with the generated MIDI draft."""

    pitch: str
    midiPitch: int
    onset: float
    offset: float
    velocity: float
    pitchBends: list[PitchBend]


def _finite_number(value: object) -> float:
    """Reject booleans and non-finite values from third-party note outputs."""
    if isinstance(value, bool) or not isinstance(value, Real):
        raise TranscriptionError("invalid_model_output")
    result = float(value)
    if not math.isfinite(result):
        raise TranscriptionError("invalid_model_output")
    return result


def _admit_events(
    raw_events: object, duration: float
) -> tuple[list[Any], list[TranscriptionWarning]]:
    """Validate bounded upstream events before MIDI construction allocates state."""
    if not isinstance(raw_events, list):
        raise TranscriptionError("invalid_model_output")
    if len(raw_events) > MAX_NOTES:
        raise TranscriptionError("transcription_too_complex")
    events: list[Any] = []
    warnings: list[TranscriptionWarning] = []
    bend_count = 0
    for event in raw_events:
        if not isinstance(event, (list, tuple)) or len(event) != 5:
            raise TranscriptionError("invalid_model_output")
        start, end = _finite_number(event[0]), _finite_number(event[1])
        pitch, amplitude, bends = event[2], _finite_number(event[3]), event[4]
        if (
            end <= start
            or isinstance(pitch, bool)
            or not isinstance(pitch, Integral)
            or not 0 <= int(pitch) <= 127
            or not 0 <= amplitude <= 1
        ):
            raise TranscriptionError("invalid_model_output")
        if bends is not None:
            if not isinstance(bends, list):
                raise TranscriptionError("invalid_model_output")
            bend_count += len(bends)
            if bend_count > MAX_PITCH_BENDS:
                raise TranscriptionError("transcription_too_complex")
            if any(
                isinstance(bend, bool)
                or not isinstance(bend, Integral)
                or not -25 <= int(bend) <= 25
                for bend in bends
            ):
                raise TranscriptionError("invalid_model_output")
        if start >= duration or end <= 0 or int(np.round(127 * amplitude)) == 0:
            warnings.append("out_of_range_notes_omitted")
            continue
        events.append((start, end, int(pitch), amplitude, bends))
    return events, warnings


def _quantize_notes(
    events: list[Any], midi: Any, duration: float
) -> tuple[list[TranscribedNote], list[TranscriptionWarning]]:
    """Bind JSON geometry and wheel samples to the exact MIDI tick grid."""
    notes: list[TranscribedNote] = []
    warnings: list[TranscriptionWarning] = []
    last_tick = int(math.floor(duration * 2 * midi.resolution))
    for start, end, pitch, amplitude, bends in events:
        clipped_start, clipped_end = max(0.0, start), min(duration, end)
        if start != clipped_start or end != clipped_end:
            warnings.append("note_times_clipped")
        start_tick = min(int(midi.time_to_tick(clipped_start)), last_tick)
        end_tick = min(int(midi.time_to_tick(clipped_end)), last_tick)
        if start_tick >= end_tick:
            warnings.append("out_of_range_notes_omitted")
            continue
        points: dict[int, int] = {}
        if bends:
            for time, bend in zip(np.linspace(start, end, len(bends)), bends, strict=True):
                tick = max(start_tick, int(midi.time_to_tick(max(0.0, float(time)))))
                if tick >= end_tick:
                    continue
                wheel = max(-8192, min(8191, int(np.round(int(bend) * 4096 / 3))))
                points[tick] = wheel
        notes.append(
            {
                "pitch": f"{_PITCH_NAMES[pitch % 12]}{pitch // 12 - 1}",
                "midiPitch": pitch,
                "onset": float(midi.tick_to_time(start_tick)),
                "offset": float(midi.tick_to_time(end_tick)),
                "velocity": int(np.round(127 * amplitude)) / 127,
                "pitchBends": [
                    {"time": float(midi.tick_to_time(tick)), "semitones": wheel / 4096}
                    for tick, wheel in sorted(points.items())
                ],
            }
        )
    return notes, warnings


def _ordered_midi(midi: Any, notes: list[TranscribedNote]) -> bytes:
    """Write note-off, wheel reset, next bend, then note-on at a shared tick."""
    mido = importlib.import_module("mido")
    buffer = io.BytesIO()
    midi.write(buffer)
    parsed = mido.MidiFile(file=io.BytesIO(buffer.getvalue()))
    if len(parsed.tracks) == 1:
        parsed.tracks.append(mido.MidiTrack())
    if len(parsed.tracks) != 2:
        raise TranscriptionError("invalid_model_output")

    events: list[tuple[int, int, int, Any]] = []
    absolute = 0
    for serial, message in enumerate(parsed.tracks[1]):
        absolute += message.time
        if message.type in {"end_of_track", "pitchwheel"}:
            continue
        priority = 0
        if message.type == "note_on":
            priority = 10 if message.velocity == 0 else 40
        elif message.type == "note_off":
            priority = 10
        events.append((absolute, priority, serial, message.copy(time=0)))

    serial = len(events)
    if any(note["pitchBends"] for note in notes):
        for control, value in ((101, 0), (100, 0), (6, 2), (38, 0), (101, 127), (100, 127)):
            events.append(
                (
                    0,
                    0,
                    serial,
                    mido.Message("control_change", channel=0, control=control, value=value),
                )
            )
            serial += 1
    for note in notes:
        if not note["pitchBends"]:
            continue
        end_tick = int(midi.time_to_tick(note["offset"]))
        events.append((end_tick, 20, serial, mido.Message("pitchwheel", channel=0, pitch=0)))
        serial += 1
        for point in note["pitchBends"]:
            events.append(
                (
                    int(midi.time_to_tick(point["time"])),
                    30,
                    serial,
                    mido.Message(
                        "pitchwheel", channel=0, pitch=int(round(point["semitones"] * 4096))
                    ),
                )
            )
            serial += 1

    track = mido.MidiTrack()
    previous = 0
    for tick, _, _, message in sorted(events, key=lambda item: item[:3]):
        track.append(message.copy(time=tick - previous))
        previous = tick
    track.append(mido.MetaMessage("end_of_track", time=1))
    parsed.tracks[1] = track
    output = io.BytesIO()
    parsed.save(file=output)
    result = output.getvalue()
    if len(result) > MAX_MIDI_BYTES:
        raise TranscriptionError("result_too_large")
    return result


def build_midi_draft(
    raw_events: object, duration: float
) -> tuple[list[TranscribedNote], bytes, list[TranscriptionWarning]]:
    """Return one bounded MIDI draft and the exact corresponding note representation."""
    duration = _finite_number(duration)
    if not 0 < duration <= 120:
        raise TranscriptionError("invalid_model_output")
    events, warnings = _admit_events(raw_events, duration)
    creation = importlib.import_module("basic_pitch.note_creation")
    admitted = creation.drop_overlapping_pitch_bends(events)
    before = sum(bool(event[4]) for event in events)
    if sum(bool(event[4]) for event in admitted) < before:
        warnings.append("overlapping_pitch_bends_omitted")
    seed = creation.note_events_to_midi([], multiple_pitch_bends=False, midi_tempo=120)
    notes, timing_warnings = _quantize_notes(admitted, seed, duration)
    notes.sort(key=lambda note: (note["onset"], note["midiPitch"], note["offset"]))
    midi = creation.note_events_to_midi(
        [
            (note["onset"], note["offset"], note["midiPitch"], note["velocity"], None)
            for note in notes
        ],
        multiple_pitch_bends=False,
        midi_tempo=120,
    )
    return notes, _ordered_midi(midi, notes), sorted(set(warnings + timing_warnings))
