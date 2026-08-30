import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable D.C. al Coda label. */ const MAX_DC_AL_CODA_LABEL_LENGTH = 14;

/** Tonight's first named D.C. al Coda for the ready rehearsal map. */
export type FirstDcAlCodaPlan = {
  label: string;
};

/** Stored song-level D.C. al Coda after lexical validation. */
export type TrustedDcAlCoda = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML D.C. al Coda labels: `D.C. al Coda` or
 * `D.C. al Coda 1`–`D.C. al Coda 9`.
 *
 * Lowercase, extra keys, inherited labels, `Da Capo`, `Dal Segno`, `To Coda`,
 * `Coda`, `D.S. al Coda`, `D.S. al Fine`, `D.C. al Fine`, `al Coda`, `Fine`,
 * `D.S.`, `D.C.`, padded, and overlong strings fail closed. This is not OCR,
 * MIR beginning/coda detection, a beginning or coda destination mark, or a
 * form tag.
 */
export function trustedDcAlCoda(value: unknown): TrustedDcAlCoda | null {
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
    !isTrustedDcAlCodaLabel(value.label)
  ) {
    return null;
  }

  return { label: value.label };
}

/** Return whether a D.C. al Coda label is a bounded Gould/MusicXML compound jump. */
export function isTrustedDcAlCodaLabel(label: string): boolean {
  if (label.length < 12 || label.length > MAX_DC_AL_CODA_LABEL_LENGTH) {
    return false;
  }
  return /^D\.C\. al Coda(?: [1-9])?$/u.test(label);
}

/**
 * Build tonight's first D.C. al Coda from a trusted stored chart compound.
 *
 * The song-level D.C. al Coda contract identifies only the return-then-coda
 * instruction and carries no verified beginning or coda destination location.
 * Customer copy therefore stays target-agnostic until a future contract
 * explicitly represents those destinations.
 */
export function firstDcAlCodaPlan(song: RehearsalSong | unknown): FirstDcAlCodaPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const dcAlCoda = trustedDcAlCoda(song.dcAlCoda);
  if (dcAlCoda === null) {
    return null;
  }

  return { label: dcAlCoda.label };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillDcAlCodaCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
