import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable Da Capo label. */ const MAX_DA_CAPO_LABEL_LENGTH = 6;

/** Tonight's first named Da Capo for the ready rehearsal map. */
export type FirstDaCapoPlan = {
  label: string;
  sectionLabel?: string;
};

/** Stored song-level Da Capo after lexical validation. */
export type TrustedDaCapo = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML Da Capo labels: `D.C.` or `D.C. 1`–`D.C. 9`.
 *
 * Lowercase, extra keys, `Fine`, `D.C. al Fine`, `Da Capo`, `D.S.`,
 * `D.C. 10`, and overlong strings fail closed. This is not OCR, MIR
 * Da Capo detection, or a form tag.
 */
export function trustedDaCapo(value: unknown): TrustedDaCapo | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (typeof value.label !== "string" || !isTrustedDaCapoLabel(value.label)) {
    return null;
  }

  return { label: value.label };
}

/**
 * Return whether a Da Capo label is a bounded Gould/MusicXML restart token.
 */
export function isTrustedDaCapoLabel(label: string): boolean {
  if (label.length < 4 || label.length > MAX_DA_CAPO_LABEL_LENGTH) {
    return false;
  }
  return /^D\.C\.(?: [1-9])?$/u.test(label);
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming Da Capo-section authority.
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
 * Build tonight's first Da Capo from a trusted stored chart restart mark.
 *
 * Missing, extra-keyed, or unusable Da Capo is not go-back-to-the-beginning
 * authority. The next action is still to stay on tonight's map, then check
 * the first range.
 */
export function firstDaCapoPlan(song: RehearsalSong | unknown): FirstDaCapoPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const daCapo = trustedDaCapo(song.daCapo);
  if (daCapo === null) {
    return null;
  }

  return {
    label: daCapo.label,
    sectionLabel: firstNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillDaCapoCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
