import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

const MAX_CODA_LABEL_LENGTH = 6;

/** Tonight's first named coda for the ready rehearsal map. */
export type FirstCodaPlan = {
  label: string;
  sectionLabel?: string;
};

/** Stored song-level coda after lexical validation. */
export type TrustedCoda = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML coda labels: `Coda` or `Coda 1`–`Coda 9`.
 *
 * Lowercase, extra keys, `To Coda`, `Coda 10`, and overlong strings fail
 * closed. This is not OCR, MIR coda detection, or a form tag.
 */
export function trustedCoda(value: unknown): TrustedCoda | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (typeof value.label !== "string" || !isTrustedCodaLabel(value.label)) {
    return null;
  }

  return { label: value.label };
}

/**
 * Return whether a coda label is a bounded Gould/MusicXML destination token.
 */
export function isTrustedCodaLabel(label: string): boolean {
  if (label.length < 4 || label.length > MAX_CODA_LABEL_LENGTH) {
    return false;
  }
  return /^Coda(?: [1-9])?$/u.test(label);
}

/**
 * Return the last named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming coda-section authority.
 */
export function lastNamedSectionLabel(song: unknown): string | undefined {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return undefined;
  }

  for (let index = song.sections.length - 1; index >= 0; index -= 1) {
    const sectionValue = song.sections[index];
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
 * Build tonight's first coda from a trusted stored chart destination.
 *
 * Missing, extra-keyed, or unusable coda is not jump-together authority.
 * The next action is still to stay on tonight's map, then check the first range.
 */
export function firstCodaPlan(song: RehearsalSong | unknown): FirstCodaPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const coda = trustedCoda(song.coda);
  if (coda === null) {
    return null;
  }

  return {
    label: coda.label,
    sectionLabel: lastNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillCodaCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
