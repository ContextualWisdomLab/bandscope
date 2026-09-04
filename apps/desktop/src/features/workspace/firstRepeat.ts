import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable repeat label. */ const MAX_REPEAT_LABEL_LENGTH = 2;

/** Tonight's first named repeat for the ready rehearsal map. */
export type FirstRepeatPlan = {
  label: string;
  sectionLabel?: string;
};

/** Stored song-level repeat after lexical validation. */
export type TrustedRepeat = {
  label: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only Gould start/end-repeat barlines and MusicXML play-counts:
 * `|:` , `:|` , or `x2`–`x9`.
 *
 * Spelled-out `repeat`, `2x`, `×2`, `x1`, `x10`, `:||`, `||:`, `D.C.`,
 * `D.S.`, `Fine`, extra keys, and overlong strings fail closed. This is
 * not OCR, MIR repeat detection, a volta ending, or a form tag.
 */
export function trustedRepeat(value: unknown): TrustedRepeat | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "label") {
      return null;
    }
  }
  if (typeof value.label !== "string" || !isTrustedRepeatLabel(value.label)) {
    return null;
  }

  return { label: value.label };
}

/**
 * Return whether a repeat label is a bounded Gould/MusicXML repeat token.
 */
export function isTrustedRepeatLabel(label: string): boolean {
  if (label.length < 2 || label.length > MAX_REPEAT_LABEL_LENGTH) {
    return false;
  }
  return label === "|:" || label === ":|" || /^x[2-9]$/u.test(label);
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming repeat-section authority.
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
 * Build tonight's first actionable repeat from a trusted stored chart mark.
 *
 * A start-repeat (`|:`) marks where a repeated passage begins; it is not an
 * instruction to play the passage again yet, so it fails closed here. The
 * song-level repeat contract also carries no section identity, therefore this
 * plan must not invent a passage anchor from the song's first named section.
 */
export function firstRepeatPlan(song: RehearsalSong | unknown): FirstRepeatPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const repeat = trustedRepeat(song.repeat);
  if (repeat === null || repeat.label === "|:") {
    return null;
  }

  return {
    label: repeat.label,
    sectionLabel: undefined
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillRepeatCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
