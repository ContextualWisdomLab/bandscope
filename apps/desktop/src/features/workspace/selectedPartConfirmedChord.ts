import { SECTION_FORM_LABELS, type RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Room-confirmed chord a selected part should lock before the section. */
export type SelectedPartConfirmedChord = {
  sectionLabel: string;
  roleName: string;
  chord: string;
};

const CANONICAL_SECTION_LABELS = new Set<string>(SECTION_FORM_LABELS);

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read an own data property and contain throwing membership or getter traps. */
function ownValue(record: object, key: string): unknown {
  try {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return undefined;
    }
    return (record as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Admit a dense array or fail closed on holes and non-arrays. */
function denseArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return null;
    }
  }

  return value;
}

/** Pull one unambiguous trusted user harmony chord from own override records. */
function ownHarmonyOverrideChord(roleValue: object): string | null | undefined {
  const overrides = denseArray(ownValue(roleValue, "manualOverrides"));
  if (!overrides) {
    return undefined;
  }

  let foundChord: string | undefined;
  for (const item of overrides) {
    if (!isRuntimeObject(item)) {
      continue;
    }
    if (ownValue(item, "field") !== "harmony") {
      continue;
    }
    if (ownValue(item, "source") !== "user") {
      continue;
    }

    const overrideValue = ownValue(item, "value");
    if (!isRuntimeObject(overrideValue) || ownValue(overrideValue, "source") !== "user") {
      continue;
    }

    const chord = meaningfulRangeText(ownValue(overrideValue, "chord"));
    if (!chord) {
      continue;
    }
    if (foundChord && foundChord !== chord) {
      return null;
    }
    foundChord = chord;
  }

  return foundChord;
}

/**
 * Pick the selected part's first room-confirmed harmony chord.
 *
 * Hidden until a named part is selected. Only own user harmony overrides
 * become buyer-visible chord authority. Conflicting role copies, inherited
 * prototypes, sparse collections, and non-canonical section labels fail
 * closed instead of inventing a rehearsal chord.
 */
export function selectedPartConfirmedChord(
  song: RehearsalSong,
  activeRole: string | null
): SelectedPartConfirmedChord | null {
  const selectedRoleId = meaningfulRangeText(activeRole);
  if (!selectedRoleId) {
    return null;
  }

  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong)) {
    return null;
  }

  const sections = denseArray(ownValue(runtimeSong, "sections"));
  if (!sections) {
    return null;
  }

  let found: SelectedPartConfirmedChord | null = null;
  let seenName: string | undefined;

  for (const sectionValue of sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }

    const sectionLabel = meaningfulRangeText(ownValue(sectionValue, "label"));
    if (!sectionLabel || !CANONICAL_SECTION_LABELS.has(sectionLabel)) {
      continue;
    }

    const roles = denseArray(ownValue(sectionValue, "roles"));
    if (!roles) {
      continue;
    }

    for (const roleValue of roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }

      const roleId = meaningfulRangeText(ownValue(roleValue, "id"));
      const roleName = meaningfulRangeText(ownValue(roleValue, "name"));
      if (!roleId || !roleName || roleId !== selectedRoleId) {
        continue;
      }

      if (seenName && seenName !== roleName) {
        return null;
      }
      seenName = roleName;

      const chord = ownHarmonyOverrideChord(roleValue);
      if (chord === null) {
        return null;
      }
      if (!chord) {
        continue;
      }

      if (found && found.chord !== chord) {
        return null;
      }

      if (!found) {
        found = { sectionLabel, roleName, chord };
      }
    }
  }

  return found;
}

/** Fill trusted `{token}` placeholders for confirmed-chord copy. */
export function fillConfirmedChordCopy(
  template: string,
  values: Record<string, string>
): string {
  return fillRangeCopy(template, values);
}
