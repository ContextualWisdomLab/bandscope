import type { RehearsalSong } from "@bandscope/shared-types";
import { firstRangeSqueeze } from "./firstRangeSqueeze";

/** Tonight's first trusted attached score, optionally paired with the first range. */
export type FirstScoreCheck = {
  fileName: string;
  sectionLabel?: string;
  roleName?: string;
  lowestNote?: string;
  highestNote?: string;
};

const SCORE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Return whether a display name contains a forbidden path or control character. */
function hasForbiddenScoreNameChar(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || character === "/" || character === "\\") {
      return true;
    }
  }
  return false;
}

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit the native attachment's PDF file name as literal display metadata.
 *
 * Native attachment owns filesystem validation and can legitimately persist
 * long names, surrounding spaces, repeated dots, and platform-reserved stems.
 * This UI helper therefore avoids imposing a second basename policy. It only
 * rejects values that cannot represent a PDF display name safely in this
 * copy surface; the value is never used to rebuild a filesystem path.
 */
export function trustedScoreFileName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || hasForbiddenScoreNameChar(value)) {
    return null;
  }

  const withoutTrailingSpaces = value.replace(/ +$/u, "");
  if (!/\.pdf$/iu.test(withoutTrailingSpaces) || withoutTrailingSpaces.length <= 4) {
    return null;
  }

  return value;
}

/**
 * Admit a score attachment only when its id matches the native UUID allowlist
 * and its file name is safe literal display metadata. Extra keys fail closed.
 */
export function trustedScoreAttachment(
  value: unknown
): { id: string; fileName: string } | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2) {
    return null;
  }
  if (
    !Object.prototype.hasOwnProperty.call(value, "id") ||
    !Object.prototype.hasOwnProperty.call(value, "fileName")
  ) {
    return null;
  }
  if (typeof value.id !== "string" || !SCORE_ID_PATTERN.test(value.id)) {
    return null;
  }
  const fileName = trustedScoreFileName(value.fileName);
  if (fileName === null) {
    return null;
  }
  return { id: value.id, fileName };
}

/**
 * Pick the first trusted attached score a player should open in Score.
 *
 * Skips malformed collection members instead of treating them as authority.
 * When a playable range also exists, pair it so the map names the notes to
 * check on the page. Runtime roots are untrusted; this never opens, reads,
 * or parses PDF bytes.
 */
export function firstScoreCheck(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstScoreCheck | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.scoreAttachments)) {
    return null;
  }

  for (const attachment of song.scoreAttachments) {
    const trusted = trustedScoreAttachment(attachment);
    if (trusted === null) {
      continue;
    }

    const range = firstRangeSqueeze(song as RehearsalSong, activeRole);
    if (range) {
      return {
        fileName: trusted.fileName,
        sectionLabel: range.sectionLabel,
        roleName: range.roleName,
        lowestNote: range.lowestNote,
        highestNote: range.highestNote
      };
    }

    return { fileName: trusted.fileName };
  }

  return null;
}
