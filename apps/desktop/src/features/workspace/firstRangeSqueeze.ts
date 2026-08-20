import type { RehearsalSong } from "@bandscope/shared-types";

/** Tonight's first named playable span on the rehearsal map. */
export type FirstRangeSqueeze = {
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

/** Return a complete, ordered scientific-pitch range or fail closed. */
function playableRange(
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

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillRangeCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, token: string) => {
    return values[token] ?? placeholder;
  });
}
