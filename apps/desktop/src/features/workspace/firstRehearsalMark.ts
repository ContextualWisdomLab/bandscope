import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Inclusive maximum length for a rehearsal-usable chart mark. */
export const MAX_REHEARSAL_MARK_TEXT_LENGTH = 2;

/** Tonight's first named chart mark for the ready rehearsal map. */
export type FirstRehearsalMarkPlan = {
  text: string;
  sectionLabel?: string;
};

/** Stored song-level rehearsal mark after lexical validation. */
export type TrustedRehearsalMark = {
  text: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould/MusicXML chart letters A–Z / AA–ZZ or numbers 1–99.
 *
 * Lowercase, leading zeros, mixed letter-digit forms, extra keys, and
 * overlong strings fail closed. This is not OCR, MIR, or a bar-number guess.
 */
export function trustedRehearsalMark(value: unknown): TrustedRehearsalMark | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "text") {
      return null;
    }
  }
  if (typeof value.text !== "string" || !isTrustedRehearsalMarkText(value.text)) {
    return null;
  }

  return { text: value.text };
}

/**
 * Return whether a chart mark is a bounded letter or number token.
 */
export function isTrustedRehearsalMarkText(text: string): boolean {
  if (text.length < 1 || text.length > MAX_REHEARSAL_MARK_TEXT_LENGTH) {
    return false;
  }
  if (/^[A-Z]+$/u.test(text)) {
    return true;
  }
  if (/^[1-9][0-9]?$/u.test(text)) {
    return true;
  }
  return false;
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming mark-section authority.
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
 * Build tonight's first rehearsal mark from a trusted stored chart letter.
 *
 * Missing, extra-keyed, or unusable mark is not start-together authority.
 * The next action is still to stay on tonight's map, then check the first range.
 */
export function firstRehearsalMarkPlan(
  song: RehearsalSong | unknown
): FirstRehearsalMarkPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const mark = trustedRehearsalMark(song.rehearsalMark);
  if (mark === null) {
    return null;
  }

  return {
    text: mark.text,
    sectionLabel: firstNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillRehearsalMarkCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
