import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable D.S. al Coda label. */ const MAX_DS_AL_CODA_LABEL_LENGTH = 14;

/** Tonight's first named D.S. al Coda for the ready rehearsal map. */
export type FirstDsAlCodaPlan = {
  label: string;
};

/** Stored song-level D.S. al Coda after lexical validation. */
export type TrustedDsAlCoda = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML D.S. al Coda labels: `D.S. al Coda` or
 * `D.S. al Coda 1`–`D.S. al Coda 9`.
 *
 * Lowercase, extra keys, inherited labels, `Dal Segno`, `To Coda`, `Coda`,
 * `D.C. al Coda`, `D.S. al Fine`, `D.C. al Fine`, `al Coda`, `Fine`, `D.S.`,
 * `D.C.`, padded, and overlong strings fail closed. This is not OCR, MIR
 * segno/coda detection, a segno or coda destination mark, or a form tag.
 */
export function trustedDsAlCoda(value: unknown): TrustedDsAlCoda | null {
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
    !isTrustedDsAlCodaLabel(value.label)
  ) {
    return null;
  }

  return { label: value.label };
}

/** Return whether a D.S. al Coda label is a bounded Gould/MusicXML compound jump. */
export function isTrustedDsAlCodaLabel(label: string): boolean {
  if (label.length < 12 || label.length > MAX_DS_AL_CODA_LABEL_LENGTH) {
    return false;
  }
  return /^D\.S\. al Coda(?: [1-9])?$/u.test(label);
}

/**
 * Build tonight's first D.S. al Coda from a trusted stored chart compound.
 *
 * The song-level D.S. al Coda contract identifies only the return-then-coda
 * instruction and carries no verified segno or coda destination location.
 * Customer copy therefore stays target-agnostic until a future contract
 * explicitly represents those destinations.
 */
export function firstDsAlCodaPlan(song: RehearsalSong | unknown): FirstDsAlCodaPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const dsAlCoda = trustedDsAlCoda(song.dsAlCoda);
  if (dsAlCoda === null) {
    return null;
  }

  return { label: dsAlCoda.label };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillDsAlCodaCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
