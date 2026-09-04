import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Inclusive maximum length for a rehearsal-usable segno label. */
export const MAX_SEGNO_LABEL_LENGTH = 7;

/** Tonight's first named segno for the ready rehearsal map. */
export type FirstSegnoPlan = {
  label: string;
  sectionLabel?: string;
};

/** Stored song-level segno after lexical validation. */
export type TrustedSegno = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML segno labels: `Segno` or `Segno 1`–`Segno 9`.
 *
 * Lowercase, extra keys, `D.S.`, `Dal Segno`, `Segno 10`, and overlong
 * strings fail closed. This is not OCR, MIR segno detection, or a form tag.
 */
export function trustedSegno(value: unknown): TrustedSegno | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (typeof value.label !== "string" || !isTrustedSegnoLabel(value.label)) {
    return null;
  }

  return { label: value.label };
}

/**
 * Return whether a segno label is a bounded Gould/MusicXML return token.
 */
export function isTrustedSegnoLabel(label: string): boolean {
  if (label.length < 5 || label.length > MAX_SEGNO_LABEL_LENGTH) {
    return false;
  }
  return /^Segno(?: [1-9])?$/u.test(label);
}

/**
 * Return the last named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming segno-section authority.
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
 * Build tonight's first segno from a trusted stored chart return mark.
 *
 * Missing, extra-keyed, or unusable segno is not return-together authority.
 * The next action is still to stay on tonight's map, then check the first range.
 */
export function firstSegnoPlan(song: RehearsalSong | unknown): FirstSegnoPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const segno = trustedSegno(song.segno);
  if (segno === null) {
    return null;
  }

  return {
    label: segno.label,
    sectionLabel: lastNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillSegnoCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
