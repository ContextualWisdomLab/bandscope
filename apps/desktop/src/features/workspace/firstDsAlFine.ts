import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable D.S. al Fine label. */ const MAX_DS_AL_FINE_LABEL_LENGTH = 14;

/** Tonight's first named D.S. al Fine for the ready rehearsal map. */
export type FirstDsAlFinePlan = {
  label: string;
};

/** Stored song-level D.S. al Fine after lexical validation. */
export type TrustedDsAlFine = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML D.S. al Fine labels: `D.S. al Fine` or
 * `D.S. al Fine 1`–`D.S. al Fine 9`.
 *
 * Lowercase, extra keys, inherited labels, `Dal Segno`, `Fine`, `To Coda`,
 * `Coda`, `D.S. al Coda`, `D.C. al Coda`, `D.C. al Fine`, `al Fine`, `D.S.`,
 * `D.C.`, padded, and overlong strings fail closed. This is not OCR, MIR
 * segno/Fine detection, a segno or Fine destination mark, or a form tag.
 */
export function trustedDsAlFine(value: unknown): TrustedDsAlFine | null {
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
    !isTrustedDsAlFineLabel(value.label)
  ) {
    return null;
  }

  return { label: value.label };
}

/** Return whether a D.S. al Fine label is a bounded Gould/MusicXML compound jump. */
export function isTrustedDsAlFineLabel(label: string): boolean {
  if (label.length < 12 || label.length > MAX_DS_AL_FINE_LABEL_LENGTH) {
    return false;
  }
  return /^D\.S\. al Fine(?: [1-9])?$/u.test(label);
}

/**
 * Build tonight's first D.S. al Fine from a trusted stored chart compound.
 *
 * The song-level D.S. al Fine contract identifies only the return-then-end
 * instruction and carries no verified segno or Fine destination location.
 * Customer copy therefore stays target-agnostic until a future contract
 * explicitly represents those destinations.
 */
export function firstDsAlFinePlan(song: RehearsalSong | unknown): FirstDsAlFinePlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const dsAlFine = trustedDsAlFine(song.dsAlFine);
  if (dsAlFine === null) {
    return null;
  }

  return { label: dsAlFine.label };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillDsAlFineCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
