import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable Dal Segno label. */ const MAX_DAL_SEGNO_LABEL_LENGTH = 6;

/** Tonight's first named Dal Segno for the ready rehearsal map. */
export type FirstDalSegnoPlan = {
  label: string;
  sectionLabel?: string;
};

/** Stored song-level Dal Segno after lexical validation. */
export type TrustedDalSegno = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML Dal Segno labels: `D.S.` or `D.S. 1`–`D.S. 9`.
 *
 * Lowercase, extra keys, `Fine`, `D.S. al Coda`, `D.S. al Fine`, `Dal Segno`,
 * `D.C.`, `segno`, `D.S. 10`, and overlong strings fail closed. This is not
 * OCR, MIR Dal Segno detection, a segno mark, or a form tag.
 */
export function trustedDalSegno(value: unknown): TrustedDalSegno | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (typeof value.label !== "string" || !isTrustedDalSegnoLabel(value.label)) {
    return null;
  }

  return { label: value.label };
}

/**
 * Return whether a Dal Segno label is a bounded Gould/MusicXML restart token.
 */
export function isTrustedDalSegnoLabel(label: string): boolean {
  if (label.length < 4 || label.length > MAX_DAL_SEGNO_LABEL_LENGTH) {
    return false;
  }
  return /^D\.S\.(?: [1-9])?$/u.test(label);
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming Dal Segno-section authority.
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
 * Build tonight's first Dal Segno from a trusted stored chart restart mark.
 *
 * Missing, extra-keyed, or unusable Dal Segno is not go-back-to-the-segno
 * authority. The next action is still to stay on tonight's map, then check
 * the first range.
 */
export function firstDalSegnoPlan(song: RehearsalSong | unknown): FirstDalSegnoPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const dalSegno = trustedDalSegno(song.dalSegno);
  if (dalSegno === null) {
    return null;
  }

  return {
    label: dalSegno.label,
    sectionLabel: firstNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillDalSegnoCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
