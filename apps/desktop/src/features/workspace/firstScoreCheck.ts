import type { RehearsalSong } from "@bandscope/shared-types";
import { firstRangeSqueeze } from "./firstRangeSqueeze";

export /** Inclusive maximum length for a rehearsal-usable score display name. */ const MAX_SCORE_DISPLAY_NAME_LENGTH = 80;

/** Tonight's first trusted attached score, optionally paired with the first range. */
export type FirstScoreCheck = {
  fileName: string;
  sectionLabel?: string;
  roleName?: string;
  lowestNote?: string;
  highestNote?: string;
};

const SCORE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const RESERVED_SCORE_STEM = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu;

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
 * Admit only a display basename for an attached score PDF.
 *
 * Path separators, control characters, reserved Win32 device stems, parent
 * traversal, leading or trailing whitespace, and overlong names fail closed.
 * This is display copy only: it is not a filesystem path, PDF parser input,
 * or native score-storage authority.
 */
export function trustedScoreFileName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value.length < 5 || value.length > MAX_SCORE_DISPLAY_NAME_LENGTH) {
    return null;
  }
  if (value !== value.trim() || hasForbiddenScoreNameChar(value) || value.includes("..")) {
    return null;
  }
  if (!/\.pdf$/iu.test(value)) {
    return null;
  }
  const stem = value.slice(0, -4);
  if (!stem || stem.endsWith(".") || stem.endsWith(" ") || RESERVED_SCORE_STEM.test(stem)) {
    return null;
  }
  return value;
}

/**
 * Admit a score attachment only when its id matches the native UUID allowlist
 * and its file name is a trusted display basename. Extra keys fail closed.
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
