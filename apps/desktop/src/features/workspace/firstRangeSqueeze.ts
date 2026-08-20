import type { RehearsalSong } from "@bandscope/shared-types";

/** Tonight's first named playable span on the rehearsal map. */
export type FirstRangeSqueeze = {
  sectionLabel: string;
  roleName: string;
  lowestNote: string;
  highestNote: string;
  overlapWarning?: string;
};

/** Return trimmed copy that is not a blank or `none` sentinel. */
export function meaningfulRangeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^none$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/**
 * Pick the first playable range a player should check before the next section.
 *
 * Prefers a named span that also carries a clash warning so the board names
 * the squeeze that will waste rehearsal time. Falls back to the first named
 * span when no clash is present. Roles without both notes stay unnamed.
 */
export function firstRangeSqueeze(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstRangeSqueeze | null {
  let fallback: FirstRangeSqueeze | null = null;

  for (const section of song.sections) {
    for (const role of section.roles) {
      if (activeRole && role.id !== activeRole) {
        continue;
      }

      const lowestNote = meaningfulRangeText(role.range.lowestNote);
      const highestNote = meaningfulRangeText(role.range.highestNote);
      if (!lowestNote || !highestNote) {
        continue;
      }

      let overlapWarning: string | undefined;
      for (const warning of role.overlapWarnings) {
        const meaningfulWarning = meaningfulRangeText(warning);
        if (meaningfulWarning) {
          overlapWarning = meaningfulWarning;
          break;
        }
      }

      const candidate: FirstRangeSqueeze = {
        sectionLabel: section.label,
        roleName: role.name,
        lowestNote,
        highestNote,
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
