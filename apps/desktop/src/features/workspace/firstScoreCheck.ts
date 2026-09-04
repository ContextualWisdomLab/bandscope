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

/** Semantic score-attachment metadata used after the persisted compatibility boundary. */
export type TrustedScoreAttachment = {
  scoreId: string;
  scoreFileName: string;
};

const SCORE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Return whether a display name contains a forbidden path or control character. */
function hasForbiddenScoreNameChar(scoreFileName: string): boolean {
  for (const character of scoreFileName) {
    const characterCode = character.charCodeAt(0);
    if (
      characterCode <= 0x1f ||
      characterCode === 0x7f ||
      character === "/" ||
      character === "\\"
    ) {
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
export function trustedScoreFileName(scoreFileNameCandidate: unknown): string | null {
  if (
    typeof scoreFileNameCandidate !== "string" ||
    scoreFileNameCandidate.length === 0 ||
    hasForbiddenScoreNameChar(scoreFileNameCandidate)
  ) {
    return null;
  }

  const scoreFileNameWithoutTrailingSpaces = scoreFileNameCandidate.replace(/ +$/u, "");
  if (
    !/\.pdf$/iu.test(scoreFileNameWithoutTrailingSpaces) ||
    scoreFileNameWithoutTrailingSpaces.length <= 4
  ) {
    return null;
  }

  return scoreFileNameCandidate;
}

/**
 * Admit a score attachment only when its id matches the native UUID allowlist
 * and its file name is safe literal display metadata. Extra keys fail closed.
 *
 * Persisted `RehearsalSong.scoreAttachments` retains the established `id` and
 * `fileName` wire keys for project compatibility. This function is the
 * anti-corruption boundary that translates those generic wire names into the
 * semantic `scoreId` and `scoreFileName` names used by workspace logic.
 */
export function trustedScoreAttachment(
  attachmentCandidate: unknown
): TrustedScoreAttachment | null {
  if (!isRuntimeObject(attachmentCandidate)) {
    return null;
  }
  const attachmentKeys = Object.keys(attachmentCandidate);
  if (attachmentKeys.length !== 2) {
    return null;
  }
  if (
    !Object.prototype.hasOwnProperty.call(attachmentCandidate, "id") ||
    !Object.prototype.hasOwnProperty.call(attachmentCandidate, "fileName")
  ) {
    return null;
  }
  if (
    typeof attachmentCandidate.id !== "string" ||
    !SCORE_ID_PATTERN.test(attachmentCandidate.id)
  ) {
    return null;
  }
  const scoreFileName = trustedScoreFileName(attachmentCandidate.fileName);
  if (scoreFileName === null) {
    return null;
  }
  return { scoreId: attachmentCandidate.id, scoreFileName };
}

/**
 * Pick the first trusted attached score a player should open in Score.
 *
 * Persisted attachment metadata is not proof that Score can read the native
 * copy. A reopened `.bscope` song has the metadata but no live project
 * workspace, so callers must explicitly pass `scoreWorkspaceAvailable=false`
 * and the helper falls back rather than advertising an impossible open action.
 * Runtime roots are untrusted; this never opens, reads, or parses PDF bytes.
 */
export function firstScoreCheck(
  song: RehearsalSong | unknown,
  activeRole: string | null = null,
  scoreWorkspaceAvailable = true
): FirstScoreCheck | null {
  if (!scoreWorkspaceAvailable || !isRuntimeObject(song) || !Array.isArray(song.scoreAttachments)) {
    return null;
  }

  for (const scoreAttachmentCandidate of song.scoreAttachments) {
    const trustedScoreMetadata = trustedScoreAttachment(scoreAttachmentCandidate);
    if (trustedScoreMetadata === null) {
      continue;
    }

    const firstPlayableRange = firstRangeSqueeze(song as RehearsalSong, activeRole);
    if (firstPlayableRange) {
      return {
        fileName: trustedScoreMetadata.scoreFileName,
        sectionLabel: firstPlayableRange.sectionLabel,
        roleName: firstPlayableRange.roleName,
        lowestNote: firstPlayableRange.lowestNote,
        highestNote: firstPlayableRange.highestNote
      };
    }

    return { fileName: trustedScoreMetadata.scoreFileName };
  }

  return null;
}
