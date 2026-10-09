import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelTranscription, createMidiPreview, saveTranscriptionMidi, exceedsPreviewPolyphony,
  midiPitchForNoteName, parseTranscriptionDraft, transcribeRecording, type TranscriptionDraft
} from "./transcription";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function fixture(): TranscriptionDraft {
  return {
    schemaVersion: 1, sourceLabel: "guitar phrase.wav", durationSeconds: 2,
    model: { name: "basic-pitch", version: "0.4.0", sha256: "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec" },
    notes: [{ pitch: "C4", midiPitch: 60, onset: 0, offset: 1, velocity: 0.7, pitchBends: [{ time: 0.1, semitones: 0.5 }] }],
    midiBase64: Buffer.from("4d546864000000060000000101e04d54726b0000000d00903c648360803c0000ff2f00", "hex").toString("base64"),
    warnings: []
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete window.__TAURI_INTERNALS__;
  delete window.__TAURI_INVOKE__;
});

describe("transcription draft boundary", () => {
  it("copies valid draft arrays and admits an empty-note result", () => {
    const input = fixture();
    const parsed = parseTranscriptionDraft(input);
    expect(parsed).toEqual(input);
    expect(parsed.notes).not.toBe(input.notes);
    expect(parsed.notes[0].pitchBends).not.toBe(input.notes[0].pitchBends);
    expect(parseTranscriptionDraft({ ...input, notes: [] }).notes).toEqual([]);
    expect(parseTranscriptionDraft({ ...input, warnings: ["audio_peak_normalized", "overlapping_pitch_bends_omitted", "note_times_clipped", "out_of_range_notes_omitted"] }).warnings).toHaveLength(4);
  });

  it.each([
    ["extra top-level field", (draft: TranscriptionDraft) => ({ ...draft, sourcePath: "/Users/private/input.wav" })],
    ["wrong schema", (draft: TranscriptionDraft) => ({ ...draft, schemaVersion: 2 })],
    ["absolute path", (draft: TranscriptionDraft) => ({ ...draft, sourceLabel: "/Users/private/input.wav" })],
    ["Windows path", (draft: TranscriptionDraft) => ({ ...draft, sourceLabel: "C:\\private\\input.wav" })],
    ["control character", (draft: TranscriptionDraft) => ({ ...draft, sourceLabel: "private\ninput.wav" })],
    ["direction override", (draft: TranscriptionDraft) => ({ ...draft, sourceLabel: "input\u202e.wav" })],
    ["overlong source", (draft: TranscriptionDraft) => ({ ...draft, sourceLabel: "a".repeat(256) })],
    ["empty source", (draft: TranscriptionDraft) => ({ ...draft, sourceLabel: "  " })],
    ["non-finite duration", (draft: TranscriptionDraft) => ({ ...draft, durationSeconds: Infinity })],
    ["empty duration", (draft: TranscriptionDraft) => ({ ...draft, durationSeconds: 0 })],
    ["overlong duration", (draft: TranscriptionDraft) => ({ ...draft, durationSeconds: 120.1 })],
    ["wrong hash", (draft: TranscriptionDraft) => ({ ...draft, model: { ...draft.model, sha256: "a".repeat(64) } })],
    ["wrong model version", (draft: TranscriptionDraft) => ({ ...draft, model: { ...draft.model, version: "0.3.0" } })],
    ["extra model field", (draft: TranscriptionDraft) => ({ ...draft, model: { ...draft.model, path: "/tmp/model.onnx" } })],
    ["too many notes", (draft: TranscriptionDraft) => ({ ...draft, notes: Array(4097).fill(draft.notes[0]) })],
    ["untrusted warning text", (draft: TranscriptionDraft) => ({ ...draft, warnings: ["/Users/private/audio.wav: failure"] })],
    ["extra warning", (draft: TranscriptionDraft) => ({ ...draft, warnings: ["overlapping_pitch_bends_omitted", "overlapping_pitch_bends_omitted"] })],
    ["data URL", (draft: TranscriptionDraft) => ({ ...draft, midiBase64: `data:audio/midi;base64,${draft.midiBase64}` })],
    ["HTML content", (draft: TranscriptionDraft) => ({ ...draft, midiBase64: btoa("<html><script>alert(1)</script></html>") })],
    ["trailing MIDI bytes", (draft: TranscriptionDraft) => ({ ...draft, midiBase64: btoa(atob(draft.midiBase64) + "extra") })],
    ["oversized MIDI", (draft: TranscriptionDraft) => ({ ...draft, midiBase64: "A".repeat(4 * Math.ceil(256 * 1024 / 3) + 4) })],
    ["non-canonical Base64", (draft: TranscriptionDraft) => ({ ...draft, midiBase64: `${draft.midiBase64}\n` })]
  ])("rejects %s", (_label, mutate) => {
    expect(() => parseTranscriptionDraft(mutate(fixture()))).toThrow("invalid");
  });

  it.each([
    { pitch: "B3" }, { pitch: "C♯4", midiPitch: 61 }, { midiPitch: 60.5 }, { midiPitch: -1 },
    { onset: -0.1 }, { offset: 0 }, { offset: 3 }, { onset: NaN }, { velocity: 1.1 },
    { velocity: NaN }, { sourcePath: "/tmp/source" },
    { pitchBends: [{ time: 1, semitones: 0 }] }, { pitchBends: [{ time: -0.1, semitones: 0 }] },
    { pitchBends: [{ time: 0.2, semitones: 3 }] }, { pitchBends: [{ time: 0.2, semitones: NaN }] },
    { pitchBends: [{ time: 0.2, semitones: 0 }, { time: 0.1, semitones: 0 }] },
    { pitchBends: [{ time: 0.2, semitones: 0, extra: true }] }
  ])("rejects malformed notes and bends %j", noteChange => {
    const draft = fixture();
    expect(() => parseTranscriptionDraft({ ...draft, notes: [{ ...draft.notes[0], ...noteChange }] })).toThrow("invalid");
  });

  it("bounds total bends across notes and accepts exact duration/pitch endpoints", () => {
    const draft = fixture();
    const bends = Array(16385).fill({ time: 0.1, semitones: 0 });
    expect(() => parseTranscriptionDraft({ ...draft, notes: [{ ...draft.notes[0], pitchBends: bends }, { ...draft.notes[0], pitchBends: bends }] })).toThrow("invalid");
    const boundary = { ...draft, durationSeconds: 120, notes: [
      { ...draft.notes[0], pitch: "C-1", midiPitch: 0, pitchBends: [] },
      { ...draft.notes[0], pitch: "G9", midiPitch: 127, onset: 119, offset: 120, pitchBends: [{ time: 119, semitones: -2 }, { time: 119.9, semitones: 2 }] }
    ] };
    expect(parseTranscriptionDraft(boundary)).toEqual(boundary);
  });

  it("sorts note names by their pitches across octave and accidental boundaries", () => {
    expect(midiPitchForNoteName("B3")).toBe(59);
    expect(midiPitchForNoteName("C4")).toBe(60);
    expect(midiPitchForNoteName("Db4")).toBe(61);
    expect(midiPitchForNoteName("C♯4")).toBe(61);
    expect(midiPitchForNoteName("G9")).toBe(127);
    expect(midiPitchForNoteName("G#9")).toBeNull();
    expect(midiPitchForNoteName("Bass")).toBeNull();
  });

  it("rejects truncated chunks and invalid SMF header fields", () => {
    for (const offset of [4, 8, 10, 12, 14, 21, 32]) {
      const draft = fixture();
      const bytes = Buffer.from(draft.midiBase64, "base64");
      bytes[offset] ^= 0xff;
      expect(() => parseTranscriptionDraft({ ...draft, midiBase64: bytes.toString("base64") })).toThrow("invalid");
    }
  });
});

describe("native transcription commands", () => {
  it("uses only the dedicated command and accepts chooser dismissal", async () => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.mocked(invoke).mockResolvedValueOnce(fixture()).mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);
    expect(await transcribeRecording()).toEqual(fixture());
    expect(invoke).toHaveBeenNthCalledWith(1, "transcribe_recording");
    expect(await transcribeRecording()).toBeNull();
    await cancelTranscription();
    expect(invoke).toHaveBeenLastCalledWith("cancel_transcription");
  });

  it("uses the established development bridge and refuses browser-only execution", async () => {
    window.__TAURI_INVOKE__ = vi.fn().mockResolvedValue(fixture());
    expect(await transcribeRecording()).toEqual(fixture());
    delete window.__TAURI_INVOKE__;
    await expect(transcribeRecording()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it.each([
    ["transcription_cancelled", "cancelled"], ["transcription_busy", "busy"],
    ["transcription_unavailable", "unavailable"], ["audio_rejected", "audio"],
    ["model_integrity_failed", "model"], ["result_too_large", "complex"],
    ["invalid_model_output", "invalid"], ["transcription_timed_out", "timeout"], ["transcription_cleanup_failed", "cleanup"],
    ["/Users/private/input.wav decode failed", "failed"]
  ])("maps native %s without retaining raw error detail", async (native, kind) => {
    window.__TAURI_INVOKE__ = vi.fn().mockRejectedValue(native);
    await expect(transcribeRecording()).rejects.toMatchObject({ kind, message: kind });
  });
});

describe("native MIDI saving", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it.each([true, false])("returns native save outcome %s and sends only the expected draft identity", async saved => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.mocked(invoke).mockResolvedValueOnce(saved);
    const draft = fixture();

    expect(await saveTranscriptionMidi(draft)).toBe(saved);

    expect(invoke).toHaveBeenCalledExactlyOnceWith("save_transcription_midi", { expectedMidiBase64: draft.midiBase64 });
  });

  it("revalidates the draft before requesting a native chooser", async () => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await expect(saveTranscriptionMidi({ ...fixture(), midiBase64: btoa("<script>bad</script>") })).rejects.toMatchObject({ kind: "invalid" });

    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([undefined, "true"])("rejects a non-boolean native save result %s", async result => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.mocked(invoke).mockResolvedValueOnce(result);
    await expect(saveTranscriptionMidi(fixture())).rejects.toMatchObject({ kind: "exportInvalid" });
  });

  it.each([
    ["transcription_export_busy", "exportBusy"], ["transcription_export_stale", "exportStale"],
    ["transcription_export_failed", "exportFailed"], ["transcription_export_invalid", "exportInvalid"]
  ])("maps native save code %s to safe recovery guidance", async (native, kind) => {
    window.__TAURI_INVOKE__ = vi.fn().mockRejectedValue(native);
    await expect(saveTranscriptionMidi(fixture())).rejects.toMatchObject({ kind, message: kind });
  });

  it("requires the desktop bridge instead of reporting a browser download as saved", async () => {
    await expect(saveTranscriptionMidi(fixture())).rejects.toMatchObject({ kind: "unavailable" });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("synth preview ownership", () => {
  let contexts: FakeAudioContext[];
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    gains: ReturnType<FakeAudioContext["createGain"]>[] = [];
    oscillators: ReturnType<FakeAudioContext["createOscillator"]>[] = [];
    constructor() { contexts.push(this); }
    createGain() {
      const gain = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      this.gains.push(gain);
      return gain;
    }
    createOscillator() {
      const oscillator = { type: "", frequency: { setValueAtTime: vi.fn() }, detune: { setValueAtTime: vi.fn() },
        start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null };
      this.oscillators.push(oscillator);
      return oscillator;
    }
  }
  beforeEach(() => {
    contexts = [];
    vi.useFakeTimers();
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  it("schedules real pitches and bends, then stops and disconnects all owned nodes", async () => {
    const ended = vi.fn();
    const preview = createMidiPreview(fixture(), ended);
    expect(await preview.start()).toBe(true);
    const context = contexts[0];
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(261.6256), 0.02);
    expect(context.oscillators[0].detune.setValueAtTime).toHaveBeenCalledWith(50, expect.closeTo(0.12));
    preview.stop();
    preview.stop();
    expect(context.oscillators[0].stop).toHaveBeenLastCalledWith();
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.gains.every(gain => gain.disconnect.mock.calls.length === 1)).toBe(true);
    expect(context.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(ended).not.toHaveBeenCalled();
    expect(await preview.start()).toBe(false);
  });

  it("does not restart after stop while browser resume is pending", async () => {
    const preview = createMidiPreview(fixture(), vi.fn());
    let resume!: () => void;
    contexts[0].resume.mockReturnValue(new Promise<void>(resolve => { resume = resolve; }));
    const started = preview.start();
    preview.stop();
    resume();
    expect(await started).toBe(false);
    expect(contexts[0].oscillators).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes naturally and limits scheduling to the current lookahead", async () => {
    const draft = fixture();
    draft.durationSeconds = 90;
    draft.notes.push({ ...draft.notes[0], onset: 80, offset: 81, pitchBends: [] });
    const ended = vi.fn();
    const preview = createMidiPreview(draft, ended);
    await preview.start();
    expect(contexts[0].oscillators).toHaveLength(1);
    contexts[0].currentTime = 80;
    vi.advanceTimersByTime(50);
    expect(contexts[0].oscillators).toHaveLength(2);
    contexts[0].currentTime = 82;
    vi.advanceTimersByTime(50);
    expect(ended).toHaveBeenCalledOnce();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up a rejected audio activation", async () => {
    const preview = createMidiPreview(fixture(), vi.fn());
    contexts[0].resume.mockRejectedValue(new Error("audio unavailable"));
    await expect(preview.start()).rejects.toThrow("audio unavailable");
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps all MIDI notes while bounding and disclosing synth polyphony", async () => {
    const draft = fixture();
    draft.notes = Array.from({ length: 33 }, () => ({ ...draft.notes[0] }));
    expect(exceedsPreviewPolyphony(draft.notes)).toBe(true);
    const preview = createMidiPreview(draft, vi.fn());
    await preview.start();
    expect(contexts[0].oscillators).toHaveLength(32);
    expect(draft.notes).toHaveLength(33);
    preview.stop();
    expect(exceedsPreviewPolyphony([{ ...draft.notes[0], onset: 0, offset: 1 }, { ...draft.notes[0], onset: 1, offset: 2 }])).toBe(false);
  });
});
