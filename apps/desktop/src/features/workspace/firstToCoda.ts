import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable To Coda label. */ const MAX_TO_CODA_LABEL_LENGTH = 9;

/** Tonight's first named To Coda for the ready rehearsal map. */
export type FirstToCodaPlan = {
  label: string;
};

/** Stored song-level To Coda after lexical validation. */
export type TrustedToCoda = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML To Coda labels: `To Coda` or `To Coda 1`–`To Coda 9`.
 *
 * Lowercase, extra keys, inherited labels, `Coda`, `D.S. al Coda`,
 * `D.C. al Coda`, `al Coda`, `Fine`, `D.S.`, padded, and overlong
 * strings fail closed. This is not OCR, MIR coda detection, a coda
 * destination mark, or a form tag.
 */
export function trustedToCoda(value: unknown): TrustedToCoda | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (
    !Object.prototype.hasOwnProperty.call(value, "label") ||
    typeof value.label !== "string" ||
    !isTrustedToCodaLabel(value.label)
  ) {
    return null;
  }

  return { label: value.label };
}

/** Return whether a To Coda label is a bounded Gould/MusicXML jump token. */
export function isTrustedToCodaLabel(label: string): boolean {
  if (label.length < 7 || label.length > MAX_TO_CODA_LABEL_LENGTH) {
    return false;
  }
  return /^To Coda(?: [1-9])?$/u.test(label);
}

/**
 * Build tonight's first To Coda from a trusted stored chart jump mark.
 *
 * The song-level To Coda contract identifies only the jump instruction and
 * carries no verified coda destination location. Customer copy therefore stays
 * target-agnostic until a future contract explicitly represents a destination.
 */
export function firstToCodaPlan(song: RehearsalSong | unknown): FirstToCodaPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const toCoda = trustedToCoda(song.toCoda);
  if (toCoda === null) {
    return null;
  }

  return { label: toCoda.label };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillToCodaCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
