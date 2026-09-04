import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /**
 * Inclusive lower bound for MusicXML `fifths` (Cb major / Ab minor).
 */ const MIN_KEY_FIFTHS = -7;
export /**
 * Inclusive upper bound for MusicXML `fifths` (C# major / A# minor).
 */ const MAX_KEY_FIFTHS = 7;
export /**
 * Rehearsal-admitted modes from the MusicXML key contract.
 */ const TRUSTED_KEY_MODES = ["major", "minor"] as const;

const SHARP_MAJOR_TONICS = ["C", "G", "D", "A", "E", "B", "F#", "C#"] as const;
const FLAT_MAJOR_TONICS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"] as const;
const SHARP_MINOR_TONICS = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#"] as const;
const FLAT_MINOR_TONICS = ["A", "D", "G", "C", "F", "Bb", "Eb", "Ab"] as const;

/** Tonight's first named concert key for the ready rehearsal map. */
export type FirstKeyPlan = {
  fifths: number;
  mode: (typeof TRUSTED_KEY_MODES)[number];
  tonic: string;
  label: string;
  sectionLabel?: string;
};

/** Stored song-level key after lexical validation. */
export type TrustedKey = {
  fifths: number;
  mode: (typeof TRUSTED_KEY_MODES)[number];
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Admit a finite integer inside an inclusive rehearsal bound. */
function trustedInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** Admit only the rehearsal major/minor mode tokens. */
function trustedMode(value: unknown): TrustedKey["mode"] | null {
  if (value === "major" || value === "minor") {
    return value;
  }
  return null;
}

/**
 * Admit only a MusicXML-shaped key with integer fifths and major/minor mode.
 *
 * Extra keys, non-integers, church modes, and out-of-range fifths fail closed.
 * This is not a key detector and does not invent MIR.
 */
export function trustedKey(value: unknown): TrustedKey | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "fifths" && key !== "mode") {
      return null;
    }
  }

  const fifths = trustedInteger(value.fifths, MIN_KEY_FIFTHS, MAX_KEY_FIFTHS);
  const mode = trustedMode(value.mode);
  if (fifths === null || mode === null) {
    return null;
  }

  return { fifths, mode };
}

/**
 * Spell the concert tonic from MusicXML fifths using the circle-of-fifths table.
 */
export function keyTonic(key: TrustedKey): string {
  if (key.fifths >= 0) {
    return key.mode === "major" ? SHARP_MAJOR_TONICS[key.fifths]! : SHARP_MINOR_TONICS[key.fifths]!;
  }

  const flats = -key.fifths;
  return key.mode === "major" ? FLAT_MAJOR_TONICS[flats]! : FLAT_MINOR_TONICS[flats]!;
}

/**
 * Return the rehearsal label `E major` / `C# minor` from a trusted key.
 */
export function keyLabel(key: TrustedKey): string {
  return `${keyTonic(key)} ${key.mode}`;
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming key-section authority.
 */
export function firstNamedSectionLabel(song: unknown): string | undefined {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return undefined;
  }

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const label = meaningfulRangeText(sectionValue.label);
    if (label) {
      return label;
    }
  }

  return undefined;
}

/**
 * Build tonight's first concert key from a trusted stored key signature.
 *
 * Missing, extra-keyed, or unusable key is not tuning authority. The next
 * action is still to confirm the concert key by ear, then check the first range.
 */
export function firstKeyPlan(song: RehearsalSong | unknown): FirstKeyPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const key = trustedKey(song.key);
  if (key === null) {
    return null;
  }

  const tonic = keyTonic(key);
  return {
    fifths: key.fifths,
    mode: key.mode,
    tonic,
    label: `${tonic} ${key.mode}`,
    sectionLabel: firstNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillKeyCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
