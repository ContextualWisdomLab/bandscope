"""Regression contracts for audible MIDI wheel state and bounded note payloads."""

from __future__ import annotations

import importlib
import io
from typing import Any

import numpy as np
import pytest

from bandscope_analysis.transcription import midi


def _messages(data: bytes) -> list[tuple[int, Any]]:
    """Read absolute MIDI ticks with a real independent SMF parser."""
    mido = importlib.import_module("mido")
    parsed = mido.MidiFile(file=io.BytesIO(data))
    tick = 0
    messages = []
    for message in parsed.tracks[1]:
        tick += message.time
        messages.append((tick, message))
    return messages


def test_touching_notes_reset_old_bend_before_next_bend_and_note_on() -> None:
    """A preceding positive wheel must not override a touching negative bend."""
    notes, data, warnings = midi.build_midi_draft(
        [(0.0, 1.0, 60, 0.6, [3, 3]), (1.0, 2.0, 62, 0.8, [-3, -3])], 2.0
    )
    boundary = [message for tick, message in _messages(data) if tick == 440]
    sounding = [message for message in boundary if message.type in {"note_on", "pitchwheel"}]
    assert [
        (m.type, getattr(m, "pitch", None), getattr(m, "velocity", None)) for m in sounding
    ] == [
        ("note_on", None, 0),
        ("pitchwheel", 0, None),
        ("pitchwheel", -4096, None),
        ("note_on", None, 102),
    ]
    wheels = [
        (tick, message.pitch) for tick, message in _messages(data) if message.type == "pitchwheel"
    ]
    assert wheels[-1] == (880, 0)
    assert notes[1]["pitchBends"] == [{"time": 1.0, "semitones": -1.0}]
    assert warnings == []


def test_overlapping_notes_omit_the_same_bends_from_json_and_midi() -> None:
    """Single-channel polyphony must not apply one instrument-wide curve to two notes."""
    notes, data, warnings = midi.build_midi_draft(
        [(0.0, 1.5, 60, 0.7, [3, 3]), (0.5, 1.0, 64, 0.5, [-3, -3])], 2.0
    )
    assert len(notes) == 2
    assert all(note["pitchBends"] == [] for note in notes)
    assert not any(message.type == "pitchwheel" for _, message in _messages(data))
    assert warnings == ["overlapping_pitch_bends_omitted"]


def test_wheel_clipping_json_scale_and_explicit_range_match_actual_midi() -> None:
    """Signed fourteen-bit clipping must agree with two-semitone RPN configuration."""
    notes, data, _ = midi.build_midi_draft([(0.0, 1.0, 61, 0.5, [-25, 25, 0])], 1.0)
    assert notes[0]["pitch"] == "C#4"
    assert notes[0]["velocity"] == 64 / 127
    assert [bend["semitones"] for bend in notes[0]["pitchBends"]] == [-2.0, 8191 / 4096]
    messages = _messages(data)
    assert [message.pitch for _, message in messages if message.type == "pitchwheel"] == [
        -8192,
        8191,
        0,
    ]
    assert [
        (message.control, message.value)
        for tick, message in messages
        if tick == 0 and message.type == "control_change"
    ] == [(101, 0), (100, 0), (6, 2), (38, 0), (101, 127), (100, 127)]


def test_unbent_note_after_bent_note_starts_with_zero_channel_wheel() -> None:
    """A note without its own curve must not inherit the preceding note's pitch bend."""
    _, data, _ = midi.build_midi_draft(
        [(0.0, 0.5, 60, 0.7, [3, 3]), (0.5, 1.0, 64, 0.5, None)], 1.0
    )
    wheel = 0
    for _, message in _messages(data):
        if message.type == "pitchwheel":
            wheel = message.pitch
        if message.type == "note_on" and message.velocity and message.note == 64:
            assert wheel == 0


def test_model_padding_is_clipped_without_moving_bends_past_note_end() -> None:
    """Inference padding cannot extend note geometry or MIDI beyond admitted audio."""
    notes, data, warnings = midi.build_midi_draft(
        [(-0.1, 2.0, 60, 0.5, [-3, 0, 3]), (3.0, 4.0, 64, 0.5, None)], 1.0
    )
    assert len(notes) == 1
    assert notes[0]["onset"] == 0
    assert notes[0]["offset"] == 1
    assert all(0 <= point["time"] < 1 for point in notes[0]["pitchBends"])
    assert warnings == ["note_times_clipped", "out_of_range_notes_omitted"]
    assert max(tick for tick, message in _messages(data) if message.type != "end_of_track") == 440


def test_empty_and_subtick_events_generate_readable_silent_midi() -> None:
    """No-note output must be valid MIDI without zero-duration or velocity-zero notes."""
    for events in ([], [(0.0, 0.0001, 60, 0.5, None)], [(0.0, 1.0, 60, 0.0, None)]):
        notes, data, _ = midi.build_midi_draft(events, 1.0)
        assert notes == []
        assert data.startswith(b"MThd")
        assert not any(message.type == "note_on" for _, message in _messages(data))


@pytest.mark.parametrize(
    "events",
    [
        None,
        [None],
        [(0, 1, 60, 0.5)],
        [(True, 1, 60, 0.5, None)],
        [("0", 1, 60, 0.5, None)],
        [(float("nan"), 1, 60, 0.5, None)],
        [(0, float("inf"), 60, 0.5, None)],
        [(1, 0, 60, 0.5, None)],
        [(0, 0, 60, 0.5, None)],
        [(0, 1, True, 0.5, None)],
        [(0, 1, 60.5, 0.5, None)],
        [(0, 1, -1, 0.5, None)],
        [(0, 1, 128, 0.5, None)],
        [(0, 1, 60, -0.1, None)],
        [(0, 1, 60, 1.1, None)],
        [(0, 1, 60, 0.5, "3")],
        [(0, 1, 60, 0.5, [True])],
        [(0, 1, 60, 0.5, [1.5])],
        [(0, 1, 60, 0.5, [26])],
    ],
)
def test_malformed_model_notes_fail_closed(events: object) -> None:
    """Reject impossible intervals, numeric representations, pitches and wheel units."""
    with pytest.raises(midi.TranscriptionError, match="^invalid_model_output$"):
        midi.build_midi_draft(events, 1.0)


@pytest.mark.parametrize("duration", [0, 121, float("nan"), True])
def test_invalid_duration_cannot_create_midi(duration: float) -> None:
    """MIDI allocation requires a finite admitted duration."""
    with pytest.raises(midi.TranscriptionError, match="^invalid_model_output$"):
        midi.build_midi_draft([], duration)


def test_event_limits_fail_instead_of_truncating_notes_or_contours() -> None:
    """The bridge must not publish a silently partial arrangement at configured limits."""
    for events in (
        [(0.0, 1.0, 60, 0.5, None)] * (midi.MAX_NOTES + 1),
        [(0.0, 1.0, 60, 0.5, [0] * (midi.MAX_PITCH_BENDS + 1))],
    ):
        with pytest.raises(midi.TranscriptionError, match="^transcription_too_complex$"):
            midi.build_midi_draft(events, 1.0)


def test_midi_binary_size_limit_is_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serialized bytes have an independent ceiling even when note counts are small."""
    monkeypatch.setattr(midi, "MAX_MIDI_BYTES", 1)
    with pytest.raises(midi.TranscriptionError, match="^result_too_large$"):
        midi.build_midi_draft([], 1.0)


def test_numpy_scalar_notes_keep_the_upstream_numeric_contract() -> None:
    """Real upstream NumPy scalars must remain accepted without admitting booleans."""
    notes, _, _ = midi.build_midi_draft(
        [(np.float64(0), np.float64(1), np.int64(60), np.float32(0.5), [np.int64(1)])],
        1.0,
    )
    assert notes[0]["midiPitch"] == 60


@pytest.mark.parametrize("writer_behavior", ["explicit_note_off", "extra_track"])
def test_serialization_admits_note_off_encoding_but_rejects_extra_instruments(
    writer_behavior: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Equivalent note-off MIDI is supported while an unexpected channel topology fails closed."""
    pretty = importlib.import_module("pretty_midi")
    mido = importlib.import_module("mido")
    original = pretty.PrettyMIDI.write

    def write(instance: Any, output: io.BytesIO) -> None:
        """Represent an alternate valid note-off encoding or a broken upstream track contract."""
        raw = io.BytesIO()
        original(instance, raw)
        parsed = mido.MidiFile(file=io.BytesIO(raw.getvalue()))
        if writer_behavior == "extra_track":
            parsed.tracks.append(mido.MidiTrack())
        else:
            for index, message in enumerate(parsed.tracks[1]):
                if message.type == "note_on" and message.velocity == 0:
                    parsed.tracks[1][index] = mido.Message(
                        "note_off", note=message.note, velocity=0, time=message.time, channel=0
                    )
        parsed.save(file=output)

    monkeypatch.setattr(pretty.PrettyMIDI, "write", write)
    events = [(0.0, 1.0, 60, 0.5, [3, 3])]
    if writer_behavior == "extra_track":
        with pytest.raises(midi.TranscriptionError, match="^invalid_model_output$"):
            midi.build_midi_draft(events, 1.0)
    else:
        _, data, _ = midi.build_midi_draft(events, 1.0)
        assert any(message.type == "note_off" for _, message in _messages(data))
