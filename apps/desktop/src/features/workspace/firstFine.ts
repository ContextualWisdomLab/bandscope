import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Inclusive maximum length for a rehearsal-usable Fine label. */
export const MAX_FINE_LABEL_LENGTH = 6;

/** Tonight's first named Fine for the ready rehearsal map. */
export type FirstFinePlan = {
  label: string;
  sectionLabel?: string;
};

/** Stored song-level Fine after lexical validation. */
export type TrustedFine = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML Fine labels: `Fine` or `Fine 1`–`Fine 9`.
 *
 * Lowercase, extra keys, `D.C.`, `D.C. al Fine`, `Da Capo`, `Fine 10`,
 * and overlong strings fail closed. This is not OCR, MIR Fine detection,
 * or a form tag.
 */
export function trustedFine(value: unknown): TrustedFine | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (typeof value.label !== "string" || !isTrustedFineLabel(value.label)) {
    return null;
  }

  return { label: value.label };
}

/**
 * Return whether a Fine label is a bounded Gould/MusicXML end token.
 */
export function isTrustedFineLabel(label: string): boolean {
  if (label.length < 4 || label.length > MAX_FINE_LABEL_LENGTH) {
    return false;
  }
  return /^Fine(?: [1-9])?$/u.test(label);
}

/**
 * Return the last named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming Fine-section authority.
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
 * Build tonight's first Fine from a trusted stored chart end mark.
 *
 * Missing, extra-keyed, or unusable Fine is not end-together authority.
 * The next action is still to stay on tonight's map, then check the first range.
 */
export function firstFinePlan(song: RehearsalSong | unknown): FirstFinePlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const fine = trustedFine(song.fine);
  if (fine === null) {
    return null;
  }

  return {
    label: fine.label,
    sectionLabel: lastNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillFineCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
