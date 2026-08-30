import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable D.C. al Fine label. */ const MAX_DC_AL_FINE_LABEL_LENGTH = 14;

/** Tonight's first named D.C. al Fine for the ready rehearsal map. */
export type FirstDcAlFinePlan = {
  label: string;
};

/** Stored song-level D.C. al Fine after lexical validation. */
export type TrustedDcAlFine = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML D.C. al Fine labels: `D.C. al Fine` or
 * `D.C. al Fine 1`–`D.C. al Fine 9`.
 *
 * Lowercase, extra keys, inherited labels, `Da Capo`, `Dal Segno`, `Fine`,
 * `To Coda`, `Coda`, `D.S. al Coda`, `D.C. al Coda`, `D.S. al Fine`,
 * `al Fine`, `D.S.`, `D.C.`, padded, and overlong strings fail closed. This
 * is not OCR, MIR beginning/Fine detection, a beginning or Fine destination
 * mark, or a form tag.
 */
export function trustedDcAlFine(value: unknown): TrustedDcAlFine | null {
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
    !isTrustedDcAlFineLabel(value.label)
  ) {
    return null;
  }

  return { label: value.label };
}

/** Return whether a D.C. al Fine label is a bounded Gould/MusicXML compound jump. */
export function isTrustedDcAlFineLabel(label: string): boolean {
  if (label.length < 12 || label.length > MAX_DC_AL_FINE_LABEL_LENGTH) {
    return false;
  }
  return /^D\.C\. al Fine(?: [1-9])?$/u.test(label);
}

/**
 * Build tonight's first D.C. al Fine from a trusted stored chart compound.
 *
 * The song-level D.C. al Fine contract identifies only the return-then-end
 * instruction and carries no verified beginning or Fine destination location.
 * Customer copy therefore stays target-agnostic until a future contract
 * explicitly represents those destinations.
 */
export function firstDcAlFinePlan(song: RehearsalSong | unknown): FirstDcAlFinePlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const dcAlFine = trustedDcAlFine(song.dcAlFine);
  if (dcAlFine === null) {
    return null;
  }

  return { label: dcAlFine.label };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillDcAlFineCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
