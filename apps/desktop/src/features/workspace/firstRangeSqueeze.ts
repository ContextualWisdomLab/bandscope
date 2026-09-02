import type { RehearsalSong } from "@bandscope/shared-types";

/** Tonight's first named playable span on the rehearsal map. */
export type FirstRangeSqueeze = {
  sectionLabel: string;
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
 * Prefers a named span that also carries a clash warning so the board names
 * the squeeze that will waste rehearsal time. Falls back to the first named
 * span when no clash is present. Runtime roots and collection members are
 * treated as untrusted; malformed evidence is isolated instead of crashing
 * the buyer-visible workspace or becoming playable-range authority.
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
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName || (activeRoleId && roleId !== activeRoleId)) {
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
        sectionLabel,
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
 * Offer the named first-range section only when its clock and identity are unique and trusted.
 *
 * Fail closed when the squeeze is missing, the section label is not unique on
 * the current map, the matching cell has no uniquely owned identity, or
 * start/end cannot be formatted as a rehearsal clock. Does not start playback;
 * #961 owns the rehearsal player.
 */
export function firstRangeTimeline(
  rehearsalSong: RehearsalSong,
  rangeSqueeze: FirstRangeSqueeze | null
): FirstRangeTimeline | null {
  if (!rangeSqueeze) {
    return null;
  }

  const runtimeSong: unknown = rehearsalSong;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const sectionIdOccurrences = new Map<string, number>();
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    if (!sectionId) {
      continue;
    }
    sectionIdOccurrences.set(sectionId, (sectionIdOccurrences.get(sectionId) ?? 0) + 1);
  }

  let timelineMatch: FirstRangeTimeline | null = null;

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (sectionLabel !== rangeSqueeze.sectionLabel) {
      continue;
    }

    const sectionId = meaningfulRangeText(sectionValue.id);
    if (
      !sectionId ||
      sectionIdOccurrences.get(sectionId) !== 1 ||
      !isRuntimeObject(sectionValue.timeRange)
    ) {
      return null;
    }

    const startSeconds = finiteNonNegativeSeconds(sectionValue.timeRange.start);
    const endSeconds = finiteNonNegativeSeconds(sectionValue.timeRange.end);
    const startClock = formatRangeClock(startSeconds);
    const endClock = formatRangeClock(endSeconds);
    if (
      startSeconds === null ||
      endSeconds === null ||
      startClock === null ||
      endClock === null ||
      endSeconds < startSeconds
    ) {
      return null;
    }

    if (timelineMatch) {
      return null;
    }

    timelineMatch = {
      sectionId,
      sectionLabel,
      startClock,
      endClock
    };
  }

  return timelineMatch;
}

/**
 * Offer the named first-range section and part only when both identities are unique and trusted.
 *
 * Fail closed when the squeeze is missing, the section label is not unique on
 * the current map, the matching cell has no uniquely owned identity, or the
 * named part is not unique on that section. Does not start playback; #961 owns
 * the rehearsal player.
 */
export function firstRangeRoadmap(
  rehearsalSong: RehearsalSong,
  rangeSqueeze: FirstRangeSqueeze | null
): FirstRangeRoadmap | null {
  if (!rangeSqueeze) {
    return null;
  }

  const runtimeSong: unknown = rehearsalSong;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const sectionIdOccurrences = new Map<string, number>();
  const sectionLabelOccurrences = new Map<string, number>();
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    if (sectionId) {
      sectionIdOccurrences.set(sectionId, (sectionIdOccurrences.get(sectionId) ?? 0) + 1);
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (sectionLabel) {
      sectionLabelOccurrences.set(
        sectionLabel,
        (sectionLabelOccurrences.get(sectionLabel) ?? 0) + 1
      );
    }
  }

  if (sectionLabelOccurrences.get(rangeSqueeze.sectionLabel) !== 1) {
    return null;
  }

  let roadmapMatch: FirstRangeRoadmap | null = null;

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (sectionLabel !== rangeSqueeze.sectionLabel) {
      continue;
    }

    const sectionId = meaningfulRangeText(sectionValue.id);
    if (!sectionId || sectionIdOccurrences.get(sectionId) !== 1) {
      return null;
    }

    const roleIdOccurrences = new Map<string, number>();
    const roleNameOccurrences = new Map<string, number>();
    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      if (roleId) {
        roleIdOccurrences.set(roleId, (roleIdOccurrences.get(roleId) ?? 0) + 1);
      }
      const roleName = meaningfulRangeText(roleValue.name);
      if (roleName) {
        roleNameOccurrences.set(roleName, (roleNameOccurrences.get(roleName) ?? 0) + 1);
      }
    }

    if (roleNameOccurrences.get(rangeSqueeze.roleName) !== 1) {
      return null;
    }

    let matchingRole: FirstRangeRoadmap | null = null;
    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleName = meaningfulRangeText(roleValue.name);
      if (roleName !== rangeSqueeze.roleName) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      if (!roleId || roleIdOccurrences.get(roleId) !== 1) {
        return null;
      }
      if (matchingRole) {
        return null;
      }
      matchingRole = {
        sectionId,
        roleId,
        sectionLabel,
        roleName
      };
    }

    if (!matchingRole) {
      return null;
    }
    if (roadmapMatch) {
      return null;
    }
    roadmapMatch = matchingRole;
  }

  return roadmapMatch;
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
