import { invoke } from "@tauri-apps/api/core";

const MODEL_SHA256 = "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec";
const MAX_NOTES = 4096;
const MAX_BENDS = 32768;
const MAX_MIDI_BYTES = 256 * 1024;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_MIDI_BYTES / 3);
const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL_PITCH_CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const WARNING_CODES = new Set(["audio_peak_normalized", "overlapping_pitch_bends_omitted", "note_times_clipped", "out_of_range_notes_omitted"]);

/** One bounded, absolute-time pitch bend that is also present in the exported MIDI. */
export type DraftPitchBend = { time: number; semitones: number };

/** A model estimate, independent of a song role until the player reviews the MIDI. */
export type DraftNote = {
  pitch: string;
  midiPitch: number;
  onset: number;
  offset: number;
  velocity: number;
  pitchBends: DraftPitchBend[];
};

/** Native transcription output admitted separately from the saved-song schema. */
export type TranscriptionDraft = {
  schemaVersion: 1;
  sourceLabel: string;
  durationSeconds: number;
  model: { name: "basic-pitch"; version: "0.4.0"; sha256: string };
  notes: DraftNote[];
  midiBase64: string;
  warnings: string[];
};

/** Public error categories prevent native paths or decoder messages reaching the WebView. */
export type TranscriptionErrorKind = "unavailable" | "busy" | "cancelled" | "audio" | "model" | "complex" | "invalid" | "timeout" | "cleanup" | "failed"
  | "exportBusy" | "exportStale" | "exportFailed" | "exportInvalid";

/** Carries only an allowlisted category across the UI boundary. */
export class TranscriptionError extends Error {
  /** Keep transport details out of errors that a feature component may display. */
  constructor(public readonly kind: TranscriptionErrorKind) {
    super(kind);
    this.name = "TranscriptionError";
  }
}

/** Reject extra fields before any object is used as native authority. */
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TranscriptionError("invalid");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) {
    throw new TranscriptionError("invalid");
  }
  return object;
}

/** Bound every time, gain, and pitch value before scheduling audio or drawing geometry. */
function finiteNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TranscriptionError("invalid");
  }
  return value;
}

/** Control and direction-override characters cannot become filenames or misleading source labels. */
function unsafeFilenameCharacter(character: string): boolean {
  const code = character.codePointAt(0)!;
  return code < 32 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

/** Accept familiar sharp/flat spellings for existing role notes without alphabetic lane sorting. */
export function midiPitchForNoteName(pitch: string): number | null {
  const match = /^([A-G])([#b♯♭]?)(-1|[0-9])$/.exec(pitch);
  if (!match) return null;
  const natural = NATURAL_PITCH_CLASSES[match[1] as keyof typeof NATURAL_PITCH_CLASSES];
  const accidental = match[2] === "#" || match[2] === "♯" ? 1 : match[2] ? -1 : 0;
  const midiPitch = (Number(match[3]) + 1) * 12 + natural + accidental;
  return midiPitch >= 0 && midiPitch <= 127 ? midiPitch : null;
}

/** Admit only bounded Standard MIDI Files, never data URLs or arbitrary bytes. */
function decodeMidi(base64: unknown): Uint8Array<ArrayBuffer> {
  if (typeof base64 !== "string" || base64.length < 32 || base64.length > MAX_BASE64_LENGTH ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new TranscriptionError("invalid");
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new TranscriptionError("invalid");
  }
  if (binary.length > MAX_MIDI_BYTES || btoa(binary) !== base64) throw new TranscriptionError("invalid");
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  if (binary.slice(0, 4) !== "MThd" || view.getUint32(4) !== 6 || view.getUint16(8) > 1 ||
      view.getUint16(10) < 1 || view.getUint16(10) > 16 || (view.getUint16(8) === 0 && view.getUint16(10) !== 1) ||
      view.getUint16(12) < 1 || view.getUint16(12) >= 0x8000) {
    throw new TranscriptionError("invalid");
  }
  let offset = 14;
  for (let track = 0; track < view.getUint16(10); track++) {
    if (offset + 8 > bytes.length || binary.slice(offset, offset + 4) !== "MTrk") throw new TranscriptionError("invalid");
    const length = view.getUint32(offset + 4);
    offset += 8;
    if (length < 4 || length > bytes.length - offset) throw new TranscriptionError("invalid");
    offset += length;
    if (bytes[offset - 3] !== 0xff || bytes[offset - 2] !== 0x2f || bytes[offset - 1] !== 0) {
      throw new TranscriptionError("invalid");
    }
  }
  if (offset !== bytes.length) throw new TranscriptionError("invalid");
  return bytes;
}

/** Validate and copy a draft so callers cannot retain authority through a mutable IPC object. */
export function parseTranscriptionDraft(value: unknown): TranscriptionDraft {
  const draft = exactObject(value, ["schemaVersion", "sourceLabel", "durationSeconds", "model", "notes", "midiBase64", "warnings"]);
  if (draft.schemaVersion !== 1 || typeof draft.sourceLabel !== "string" || !draft.sourceLabel.trim() ||
      draft.sourceLabel.length > 255 || /[\\/]/u.test(draft.sourceLabel) || Array.from(draft.sourceLabel).some(unsafeFilenameCharacter)) {
    throw new TranscriptionError("invalid");
  }
  const durationSeconds = finiteNumber(draft.durationSeconds, Number.MIN_VALUE, 120);
  const model = exactObject(draft.model, ["name", "version", "sha256"]);
  if (model.name !== "basic-pitch" || model.version !== "0.4.0" || model.sha256 !== MODEL_SHA256) {
    throw new TranscriptionError("invalid");
  }
  if (!Array.isArray(draft.notes) || draft.notes.length > MAX_NOTES || !Array.isArray(draft.warnings) ||
      draft.warnings.length > WARNING_CODES.size || new Set(draft.warnings).size !== draft.warnings.length ||
      draft.warnings.some(warning => typeof warning !== "string" || !WARNING_CODES.has(warning))) {
    throw new TranscriptionError("invalid");
  }
  let bendCount = 0;
  const notes = draft.notes.map((value): DraftNote => {
    const note = exactObject(value, ["pitch", "midiPitch", "onset", "offset", "velocity", "pitchBends"]);
    const midiPitch = finiteNumber(note.midiPitch, 0, 127);
    if (!Number.isInteger(midiPitch) || note.pitch !== `${PITCH_CLASSES[midiPitch % 12]}${Math.floor(midiPitch / 12) - 1}`) {
      throw new TranscriptionError("invalid");
    }
    const onset = finiteNumber(note.onset, 0, durationSeconds);
    const offset = finiteNumber(note.offset, 0, durationSeconds);
    const velocity = finiteNumber(note.velocity, 0, 1);
    if (offset <= onset || !Array.isArray(note.pitchBends) || note.pitchBends.length > MAX_BENDS - bendCount) {
      throw new TranscriptionError("invalid");
    }
    bendCount += note.pitchBends.length;
    let previousTime = onset;
    const pitchBends = note.pitchBends.map((value): DraftPitchBend => {
      const bend = exactObject(value, ["time", "semitones"]);
      const time = finiteNumber(bend.time, previousTime, offset);
      if (time >= offset) throw new TranscriptionError("invalid");
      previousTime = time;
      return { time, semitones: finiteNumber(bend.semitones, -2, 2) };
    });
    return { pitch: note.pitch as string, midiPitch, onset, offset, velocity, pitchBends };
  });
  decodeMidi(draft.midiBase64);
  return {
    schemaVersion: 1,
    sourceLabel: draft.sourceLabel,
    durationSeconds,
    model: { name: "basic-pitch", version: "0.4.0", sha256: MODEL_SHA256 },
    notes,
    midiBase64: draft.midiBase64 as string,
    warnings: [...draft.warnings] as string[]
  };
}

/** Collapse native codes to useful recovery guidance without retaining raw error text. */
function nativeError(value: unknown): TranscriptionError {
  if (value instanceof TranscriptionError) return value;
  const code = typeof value === "string" ? value : "";
  if (code === "transcription_cancelled") return new TranscriptionError("cancelled");
  if (code === "transcription_busy") return new TranscriptionError("busy");
  if (code === "transcription_unavailable") return new TranscriptionError("unavailable");
  if (code === "transcription_timed_out") return new TranscriptionError("timeout");
  if (code === "transcription_cleanup_failed") return new TranscriptionError("cleanup");
  if (code === "transcription_export_busy") return new TranscriptionError("exportBusy");
  if (code === "transcription_export_stale") return new TranscriptionError("exportStale");
  if (code === "transcription_export_failed") return new TranscriptionError("exportFailed");
  if (code === "transcription_export_invalid") return new TranscriptionError("exportInvalid");
  if (["audio_unavailable", "audio_rejected", "invalid_request"].includes(code)) return new TranscriptionError("audio");
  if (["model_unavailable", "model_integrity_failed"].includes(code)) return new TranscriptionError("model");
  if (["transcription_too_complex", "result_too_large"].includes(code)) return new TranscriptionError("complex");
  if (["transcription_output_invalid", "invalid_model_output"].includes(code)) return new TranscriptionError("invalid");
  return new TranscriptionError("failed");
}

/** Use the same real-bridge detection as local audio intake, with no fabricated browser result. */
async function transcriptionCommand(...call:
  [command: "transcribe_recording" | "cancel_transcription"] |
  [command: "save_transcription_midi", args: { expectedMidiBase64: string }]
): Promise<unknown> {
  try {
    if (typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function") {
      return await (call.length === 1 ? invoke<unknown>(call[0]) : invoke<unknown>(call[0], call[1]));
    }
    if (typeof window !== "undefined" && typeof window.__TAURI_INVOKE__ === "function") {
      return await (call.length === 1 ? window.__TAURI_INVOKE__(call[0]) : window.__TAURI_INVOKE__(call[0], call[1]));
    }
    throw new TranscriptionError("unavailable");
  } catch (error) {
    throw nativeError(error);
  }
}

/** The native chooser owns source selection; null means the player dismissed that chooser. */
export async function transcribeRecording(): Promise<TranscriptionDraft | null> {
  const result = await transcriptionCommand("transcribe_recording");
  return result === null ? null : parseTranscriptionDraft(result);
}

/** Cancel only the transcription process owned by BandScope, without accepting OS identifiers. */
export async function cancelTranscription(): Promise<void> {
  await transcriptionCommand("cancel_transcription");
}

/** Native code compares against its verified draft and owns the chooser, filename, and write. */
export async function saveTranscriptionMidi(value: TranscriptionDraft): Promise<boolean> {
  const draft = parseTranscriptionDraft(value);
  const result = await transcriptionCommand("save_transcription_midi", { expectedMidiBase64: draft.midiBase64 });
  if (typeof result !== "boolean") throw new TranscriptionError("exportInvalid");
  return result;
}

/** Preview lifecycle remains available while AudioContext.resume is waiting on the browser. */
export type MidiPreview = { start(): Promise<boolean>; stop(): void };

/** Estimate peak overlap to disclose the synthesizer's 32-voice limit before playback. */
export function exceedsPreviewPolyphony(notes: DraftNote[]): boolean {
  const events = notes.flatMap(note => [{ time: note.onset, delta: 1 }, { time: note.offset, delta: -1 }]);
  events.sort((left, right) => left.time - right.time || left.delta - right.delta);
  let active = 0;
  return events.some(event => (active += event.delta) > 32);
}

/** Schedule a short lookahead so a 120-second draft never allocates all its oscillators at once. */
export function createMidiPreview(value: TranscriptionDraft, onEnded: () => void): MidiPreview {
  const draft = parseTranscriptionDraft(value);
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.2;
  master.connect(context.destination);
  const notes = [...draft.notes].sort((left, right) => left.onset - right.onset);
  const voices = new Set<{ oscillator: OscillatorNode; gain: GainNode; start: number; end: number }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let started = false;
  let origin = 0;
  let nextNote = 0;

  /** Stop scheduled and sounding notes even when resume has not completed yet. */
  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    for (const voice of voices) {
      voice.oscillator.onended = null;
      voice.oscillator.stop();
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
    master.disconnect();
    void context.close().catch(() => undefined);
  }

  /** Keep every pitch bend on its own oscillator instead of bending overlapping voices together. */
  function schedule(): void {
    if (stopped) return;
    const now = context.currentTime;
    for (const voice of voices) {
      if (voice.end <= now) {
        voice.oscillator.onended = null;
        voice.oscillator.disconnect();
        voice.gain.disconnect();
        voices.delete(voice);
      }
    }
    while (nextNote < notes.length && origin + notes[nextNote].onset <= now + 0.25) {
      const note = notes[nextNote++];
      const end = origin + note.offset;
      if (end <= now) continue;
      const start = Math.max(now, origin + note.onset);
      let overlapping = 0;
      for (const voice of voices) if (voice.end > start) overlapping++;
      if (overlapping >= 32) continue;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(440 * 2 ** ((note.midiPitch - 69) / 12), start);
      for (const bend of note.pitchBends) oscillator.detune.setValueAtTime(bend.semitones * 100, Math.max(start, origin + bend.time));
      const attackEnd = Math.min(start + 0.01, start + (end - start) / 3);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.velocity * 0.12, attackEnd);
      gain.gain.setValueAtTime(note.velocity * 0.12, Math.max(attackEnd, end - 0.025));
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain);
      gain.connect(master);
      const voice = { oscillator, gain, start, end };
      voices.add(voice);
      /** Free each finished voice without waiting for the next scheduling tick. */
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        voices.delete(voice);
      };
      oscillator.start(start);
      oscillator.stop(end);
    }
    if (nextNote === notes.length && voices.size === 0) {
      stop();
      onEnded();
    }
  }

  /** Start only once and ignore a late resume after the player stopped or left the screen. */
  async function start(): Promise<boolean> {
    if (stopped || started) return false;
    started = true;
    try {
      await context.resume();
      if (stopped) return false;
      origin = context.currentTime + 0.02;
      schedule();
      if (!stopped) timer = setInterval(schedule, 50);
      return !stopped;
    } catch (error) {
      stop();
      throw error;
    }
  }
  return { start, stop };
}
