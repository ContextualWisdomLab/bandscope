import type { RehearsalSong } from "@bandscope/shared-types";

/** Tonight's first named playable span on the rehearsal map. */
export type FirstRangeSqueeze = {
  sectionId?: string;
  sectionLabel: string;
  roleId: string;
  roleName: string;
  lowestNote: string;
  highestNote: string;
  overlapWarning?: string;
};

/** Clocked structure cell for tonight's first playable span. */
export type FirstRangeTimeline = {
  sectionId: string;
  sectionLabel: string;
  startClock: string;
  endClock: string;
};

/** Trusted roadmap cell for tonight's first playable span. */
export type FirstRangeRoadmap = {
  sectionId: string;
  roleId: string;
  sectionLabel: string;
  roleName: string;
};

const NATURAL_PITCH_CLASS = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
} as const;

const ACCIDENTAL_OFFSET: Record<string, number> = {
  "": 0,
  "#": 1,
  "♯": 1,
  b: -1,
  "♭": -1
};

const NOTE_PATTERN = /^([A-Ga-g])([#b♯♭]?)(-?\d{1,2})$/u;

/** Return whether an untrusted runtime candidate is a plain object record. */
function isRuntimeObject(runtimeCandidate: unknown): runtimeCandidate is Record<string, unknown> {
  return typeof runtimeCandidate === "object" && runtimeCandidate !== null && !Array.isArray(runtimeCandidate);
}

/** Return finite non-negative seconds, or fail closed. */
function finiteNonNegativeSeconds(secondsCandidate: unknown): number | null {
  if (
    typeof secondsCandidate !== "number" ||
    !Number.isFinite(secondsCandidate) ||
    secondsCandidate < 0
  ) {
    return null;
  }
  return secondsCandidate;
}

/** Return trimmed range copy that is not a blank or `none` sentinel. */
export function meaningfulRangeText(rangeTextCandidate: unknown): string | undefined {
  if (typeof rangeTextCandidate !== "string") {
    return undefined;
  }
  const trimmedRangeText = rangeTextCandidate.trim();
  if (!trimmedRangeText || /^none$/i.test(trimmedRangeText)) {
    return undefined;
  }
  return trimmedRangeText;
}

/**
 * Admit a navigation identity only when its serialized spelling is already canonical.
 *
 * DOM refs and shared-type identities are keyed by the exact value. Trimming an
 * untrusted ID would create a control whose target does not exist, so surrounding
 * whitespace is rejected rather than silently normalized.
 */
function exactNavigationIdentity(identityCandidate: unknown): string | null {
  if (typeof identityCandidate !== "string" || !identityCandidate) {
    return null;
  }
  return identityCandidate.trim() === identityCandidate ? identityCandidate : null;
}

/** Resolve one exact section identity only when it occurs once in the current song. */
function uniqueSectionByIdentity(
  rehearsalSong: RehearsalSong,
  sectionIdentity: string
): Record<string, unknown> | null {
  const runtimeSong: unknown = rehearsalSong;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  let sectionIdOccurrences = 0;
  let targetSection: Record<string, unknown> | null = null;
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    if (exactNavigationIdentity(sectionValue.id) === sectionIdentity) {
      sectionIdOccurrences += 1;
      targetSection = sectionValue;
    }
  }

  return sectionIdOccurrences === 1 ? targetSection : null;
}

/** Resolve one exact role identity only when it occurs once inside the target section. */
function uniqueRoleByIdentity(
  targetSection: Record<string, unknown>,
  roleIdentity: string
): Record<string, unknown> | null {
  if (!Array.isArray(targetSection.roles)) {
    return null;
  }

  let roleIdOccurrences = 0;
  let targetRole: Record<string, unknown> | null = null;
  for (const roleValue of targetSection.roles) {
    if (!isRuntimeObject(roleValue)) {
      continue;
    }
    if (exactNavigationIdentity(roleValue.id) === roleIdentity) {
      roleIdOccurrences += 1;
      targetRole = roleValue;
    }
  }

  return roleIdOccurrences === 1 ? targetRole : null;
}

/** Revalidate an existing timeline focus request against the current song identity graph. */
export function hasUniqueSectionNavigationTarget(
  rehearsalSong: RehearsalSong,
  sectionIdentityCandidate: unknown
): boolean {
  const sectionIdentity = exactNavigationIdentity(sectionIdentityCandidate);
  return sectionIdentity !== null && uniqueSectionByIdentity(rehearsalSong, sectionIdentity) !== null;
}

/** Revalidate an existing roadmap focus request against the current song identity graph. */
export function hasUniqueRoadmapNavigationTarget(
  rehearsalSong: RehearsalSong,
  sectionIdentityCandidate: unknown,
  roleIdentityCandidate: unknown
): boolean {
  const sectionIdentity = exactNavigationIdentity(sectionIdentityCandidate);
  const roleIdentity = exactNavigationIdentity(roleIdentityCandidate);
  if (sectionIdentity === null || roleIdentity === null) {
    return false;
  }
  const targetSection = uniqueSectionByIdentity(rehearsalSong, sectionIdentity);
  return targetSection !== null && uniqueRoleByIdentity(targetSection, roleIdentity) !== null;
}

/** Convert a bounded scientific-pitch label into chromatic ordering. */
function notePitchValue(noteLabel: string): number | null {
  const noteMatch = NOTE_PATTERN.exec(noteLabel);
  if (!noteMatch) {
    return null;
  }
  const noteLetter = noteMatch[1].toUpperCase() as keyof typeof NATURAL_PITCH_CLASS;
  const noteOctave = Number(noteMatch[3]);
  return (
    (noteOctave + 1) * 12 +
    NATURAL_PITCH_CLASS[noteLetter] +
    ACCIDENTAL_OFFSET[noteMatch[2]]
  );
}

/**
 * Return a complete, ordered scientific-pitch range or fail closed.
 *
 * Shared by the first-range callout and the section roadmap so both surfaces
 * only present spans that parse as scientific pitch labels in low-to-high
 * order; malformed or inverted evidence is rejected instead of being shown
 * as playable-range guidance.
 */
export function playableRange(
  lowestNoteValue: unknown,
  highestNoteValue: unknown
): Pick<FirstRangeSqueeze, "lowestNote" | "highestNote"> | null {
  const lowestNote = meaningfulRangeText(lowestNoteValue);
  const highestNote = meaningfulRangeText(highestNoteValue);
  if (!lowestNote || !highestNote) {
    return null;
  }

  const lowestPitch = notePitchValue(lowestNote);
  const highestPitch = notePitchValue(highestNote);
  if (lowestPitch === null || highestPitch === null || lowestPitch > highestPitch) {
    return null;
  }

  return { lowestNote, highestNote };
}

/**
 * Format a rehearsal clock as `m:ss`, or fail closed on unusable values.
 *
 * Unlike the structure-grid fallback that renders `0:00` for NaN times, the
 * first-range find control must not invent a clock the player cannot trust.
 */
export function formatRangeClock(clockSecondsCandidate: unknown): string | null {
  const safeSeconds = finiteNonNegativeSeconds(clockSecondsCandidate);
  if (safeSeconds === null) {
    return null;
  }
  const clockMinutes = Math.floor(safeSeconds / 60);
  const clockSeconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${clockMinutes}:${clockSeconds}`;
}

/**
 * Pick the first playable range a player should check before the next section.
 *
 * Playable-range truth does not depend on whether the originating record can
 * also become UI navigation authority. Exact section/role identity evidence is
 * preserved here and validated separately by the timeline/roadmap resolvers,
 * so an unsafe ID can hide Find without erasing valid range guidance.
 */
export function firstRangeSqueeze(
  rehearsalSong: RehearsalSong,
  activeRoleId: string | null = null
): FirstRangeSqueeze | null {
  const runtimeSong: unknown = rehearsalSong;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  let fallbackRange: FirstRangeSqueeze | null = null;

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    const sectionId = typeof sectionValue.id === "string" ? sectionValue.id : undefined;
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = typeof roleValue.id === "string" ? roleValue.id : "";
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleName || (activeRoleId && roleId !== activeRoleId)) {
        continue;
      }
      if (!isRuntimeObject(roleValue.range)) {
        continue;
      }

      const playableRoleRange = playableRange(
        roleValue.range.lowestNote,
        roleValue.range.highestNote
      );
      if (!playableRoleRange) {
        continue;
      }

      let overlapWarning: string | undefined;
      if (Array.isArray(roleValue.overlapWarnings)) {
        for (const overlapWarningValue of roleValue.overlapWarnings) {
          const meaningfulWarning = meaningfulRangeText(overlapWarningValue);
          if (meaningfulWarning) {
            overlapWarning = meaningfulWarning;
            break;
          }
        }
      }

      const rangeCandidate: FirstRangeSqueeze = {
        sectionId,
        sectionLabel,
        roleId,
        roleName,
        ...playableRoleRange,
        overlapWarning
      };

      if (overlapWarning) {
        return rangeCandidate;
      }

      if (!fallbackRange) {
        fallbackRange = rangeCandidate;
      }
    }
  }

  return fallbackRange;
}

/**
 * Offer the originating first-range section only when its identity and clock are trusted.
 *
 * Display labels may repeat in ordinary song form and therefore are not
 * navigation authority. The selected section ID must occur exactly once on
 * the current map; its current label and time range are then derived from that
 * cell. Does not start playback; #961 owns the rehearsal player.
 */
export function firstRangeTimeline(
  rehearsalSong: RehearsalSong,
  rangeSqueeze: FirstRangeSqueeze | null
): FirstRangeTimeline | null {
  if (!rangeSqueeze) {
    return null;
  }

  const targetSectionId = exactNavigationIdentity(rangeSqueeze.sectionId);
  if (!targetSectionId) {
    return null;
  }

  const targetSection = uniqueSectionByIdentity(rehearsalSong, targetSectionId);
  if (!targetSection || !isRuntimeObject(targetSection.timeRange)) {
    return null;
  }

  const sectionLabel = meaningfulRangeText(targetSection.label);
  const startSeconds = finiteNonNegativeSeconds(targetSection.timeRange.start);
  const endSeconds = finiteNonNegativeSeconds(targetSection.timeRange.end);
  const startClock = formatRangeClock(startSeconds);
  const endClock = formatRangeClock(endSeconds);
  if (
    !sectionLabel ||
    startSeconds === null ||
    endSeconds === null ||
    startClock === null ||
    endClock === null ||
    endSeconds <= startSeconds
  ) {
    return null;
  }

  return {
    sectionId: targetSectionId,
    sectionLabel,
    startClock,
    endClock
  };
}

/**
 * Offer the originating first-range section and part only when their IDs remain unique and trusted.
 *
 * Section labels and role display names may repeat. The selected section ID
 * must occur exactly once across the map and the selected role ID exactly once
 * inside that section; current presentation copy is derived from those cells.
 * Does not start playback; #961 owns the rehearsal player.
 */
export function firstRangeRoadmap(
  rehearsalSong: RehearsalSong,
  rangeSqueeze: FirstRangeSqueeze | null
): FirstRangeRoadmap | null {
  if (!rangeSqueeze) {
    return null;
  }

  const targetSectionId = exactNavigationIdentity(rangeSqueeze.sectionId);
  const targetRoleId = exactNavigationIdentity(rangeSqueeze.roleId);
  if (!targetSectionId || !targetRoleId) {
    return null;
  }

  const targetSection = uniqueSectionByIdentity(rehearsalSong, targetSectionId);
  if (!targetSection) {
    return null;
  }
  const targetRole = uniqueRoleByIdentity(targetSection, targetRoleId);
  if (!targetRole) {
    return null;
  }

  const sectionLabel = meaningfulRangeText(targetSection.label);
  const roleName = meaningfulRangeText(targetRole.name);
  if (!sectionLabel || !roleName) {
    return null;
  }

  return {
    sectionId: targetSectionId,
    roleId: targetRoleId,
    sectionLabel,
    roleName
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillRangeCopy(
  copyTemplate: string,
  copyValues: Record<string, string>
): string {
  return copyTemplate.replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/g,
    (copyPlaceholder, copyToken: string) => {
      // Own-property lookup only: inherited members such as `toString` must
      // never satisfy a token, or the raw function source would be rendered.
      return Object.prototype.hasOwnProperty.call(copyValues, copyToken)
        ? copyValues[copyToken]
        : copyPlaceholder;
    }
  );
}
