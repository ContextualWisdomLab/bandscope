import type { RehearsalSong } from "@bandscope/shared-types";

/** Tonight's first named playable span on the rehearsal map. */
export type FirstRangeSqueeze = {
  roleId: string;
  sectionLabel: string;
  roleName: string;
  lowestNote: string;
  highestNote: string;
  overlapWarning?: string;
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

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return trimmed copy that is not a blank or `none` sentinel. */
export function meaningfulRangeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || /^none$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/** Convert a bounded scientific-pitch label into chromatic ordering. */
function notePitchValue(note: string): number | null {
  const match = NOTE_PATTERN.exec(note);
  if (!match) {
    return null;
  }
  const letter = match[1].toUpperCase() as keyof typeof NATURAL_PITCH_CLASS;
  const octave = Number(match[3]);
  return (octave + 1) * 12 + NATURAL_PITCH_CLASS[letter] + ACCIDENTAL_OFFSET[match[2]];
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
 * Pick the first playable range a player should check before the next section.
 *
 * Prefers a named span that also carries a clash warning so the board names
 * the squeeze that will waste rehearsal time. Falls back to the first named
 * span when no clash is present. Runtime roots and collection members are
 * treated as untrusted; malformed evidence is isolated instead of crashing
 * the buyer-visible workspace or becoming playable-range authority.
 */
export function firstRangeSqueeze(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstRangeSqueeze | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  let fallback: FirstRangeSqueeze | null = null;

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
      if (!roleId || !roleName || (activeRole && roleId !== activeRole)) {
        continue;
      }
      if (!isRuntimeObject(roleValue.range)) {
        continue;
      }

      const range = playableRange(roleValue.range.lowestNote, roleValue.range.highestNote);
      if (!range) {
        continue;
      }

      let overlapWarning: string | undefined;
      if (Array.isArray(roleValue.overlapWarnings)) {
        for (const warning of roleValue.overlapWarnings) {
          const meaningfulWarning = meaningfulRangeText(warning);
          if (meaningfulWarning) {
            overlapWarning = meaningfulWarning;
            break;
          }
        }
      }

      const candidate: FirstRangeSqueeze = {
        roleId,
        sectionLabel,
        roleName,
        ...range,
        overlapWarning
      };

      if (overlapWarning) {
        return candidate;
      }

      if (!fallback) {
        fallback = candidate;
      }
    }
  }

  return fallback;
}

/**
 * Offer the named first-range part only when the map is not already on it.
 *
 * Fail closed when the squeeze is missing, the role id is unknown to the
 * current switcher, or that part is already selected. The instrument-check
 * sentence remains the next action once the part is open.
 */
export function firstRangeOpenPart(
  squeeze: FirstRangeSqueeze | null,
  activeRole: string | null,
  roles: ReadonlyArray<{ id: string }>
): FirstRangeSqueeze | null {
  if (!squeeze || !Array.isArray(roles)) {
    return null;
  }
  if (activeRole === squeeze.roleId) {
    return null;
  }
  if (!roles.some((role) => role.id === squeeze.roleId)) {
    return null;
  }
  return squeeze;
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillRangeCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, token: string) => {
    // Own-property lookup only: inherited members such as `toString` must
    // never satisfy a token, or the raw function source would be rendered.
    return Object.prototype.hasOwnProperty.call(values, token) ? values[token] : placeholder;
  });
}
