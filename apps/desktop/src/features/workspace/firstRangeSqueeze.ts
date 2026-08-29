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

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read an owned data-property without invoking an accessor or Proxy get trap. */
export function ownDataProperty(record: Record<string, unknown>, property: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
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
 * Returns the first named span that passes playable-range validation. Any
 * warning attached to that span is preserved for copy selection. Runtime
 * roots and collection members are
 * treated as untrusted; malformed evidence is isolated instead of crashing
 * the buyer-visible workspace or becoming playable-range authority.
 */
export function firstRangeSqueeze(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstRangeSqueeze | null {
  const runtimeSong: unknown = song;
  const sections = isRuntimeObject(runtimeSong) ? ownDataProperty(runtimeSong, "sections") : undefined;
  if (!Array.isArray(sections)) {
    return null;
  }

  for (const sectionValue of sections) {
    const roles = isRuntimeObject(sectionValue) ? ownDataProperty(sectionValue, "roles") : undefined;
    if (!isRuntimeObject(sectionValue) || !Array.isArray(roles)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(ownDataProperty(sectionValue, "label"));
    if (!sectionLabel) {
      continue;
    }

    for (const roleValue of roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(ownDataProperty(roleValue, "id"));
      const roleName = meaningfulRangeText(ownDataProperty(roleValue, "name"));
      if (!roleId || !roleName || (activeRole && roleId !== activeRole)) {
        continue;
      }
      const rangeValue = ownDataProperty(roleValue, "range");
      if (!isRuntimeObject(rangeValue)) {
        continue;
      }

      const range = playableRange(
        ownDataProperty(rangeValue, "lowestNote"),
        ownDataProperty(rangeValue, "highestNote")
      );
      if (!range) {
        continue;
      }

      let overlapWarning: string | undefined;
      const overlapWarnings = ownDataProperty(roleValue, "overlapWarnings");
      if (Array.isArray(overlapWarnings)) {
        for (const warning of overlapWarnings) {
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

      return candidate;
    }
  }

  return null;
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillRangeCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, token: string) => {
    // Own-property lookup only: inherited members such as `toString` must
    // never satisfy a token, or the raw function source would be rendered.
    return Object.prototype.hasOwnProperty.call(values, token) ? values[token] : placeholder;
  });
}
