import { SECTION_FORM_LABELS, type RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first trusted first-pass take for a selected named part. */
export type FirstPassSimplification =
  | {
      status: "ready";
      value: string;
      sectionLabel: string;
      roleName: string;
    }
  | { status: "unavailable" };

type SelectedRoleCopy = {
  sectionLabel: string;
  roleName: string;
  simplification: string | null;
};

const CANONICAL_SECTION_LABELS = new Set<string>(SECTION_FORM_LABELS);

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a record owns a field rather than inheriting it. */
function owns(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

/** Admit one own-property simplification without granting inherited members authority. */
function admitSimplification(roleValue: Record<string, unknown>): string | null {
  if (!owns(roleValue, "simplification")) {
    return null;
  }

  return meaningfulRangeText(roleValue.simplification) ?? null;
}

/**
 * Name the selected part's first trusted first-pass take.
 *
 * Simplification is the rehearsal instruction the player should play before
 * adding the rest of the part. This is selected-part guidance, not the
 * song-wide first-simpler-take map product, and it is not Active Player or
 * MIR work. Inherited simplification fields, blank or `none` values, unnamed
 * roles, duplicate ids in one section, conflicting display names, and
 * non-canonical section labels fail closed instead of becoming first-pass
 * authority.
 */
export function firstPassSimplification(
  song: RehearsalSong | unknown,
  activeRole: string | null
): FirstPassSimplification {
  const selectedRoleId = meaningfulRangeText(activeRole);
  if (!selectedRoleId || !isRuntimeObject(song) || !owns(song, "sections") || !Array.isArray(song.sections)) {
    return { status: "unavailable" };
  }

  const copies: SelectedRoleCopy[] = [];
  let knownName: string | undefined;

  for (const sectionValue of song.sections) {
    if (
      !isRuntimeObject(sectionValue) ||
      !owns(sectionValue, "label") ||
      !owns(sectionValue, "roles") ||
      !Array.isArray(sectionValue.roles)
    ) {
      return { status: "unavailable" };
    }

    const rawLabel = meaningfulRangeText(sectionValue.label);
    if (!rawLabel) {
      return { status: "unavailable" };
    }

    const sectionRoleIds = new Set<string>();
    let selectedCopy: Record<string, unknown> | null = null;

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue) || !owns(roleValue, "id") || !owns(roleValue, "name")) {
        return { status: "unavailable" };
      }

      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName) {
        return { status: "unavailable" };
      }
      if (sectionRoleIds.has(roleId)) {
        return { status: "unavailable" };
      }
      sectionRoleIds.add(roleId);

      if (roleId !== selectedRoleId) {
        continue;
      }
      if (selectedCopy) {
        return { status: "unavailable" };
      }
      selectedCopy = roleValue;
    }

    if (!selectedCopy) {
      continue;
    }

    const roleName = meaningfulRangeText(selectedCopy.name);
    if (!roleName) {
      return { status: "unavailable" };
    }
    if (knownName && knownName !== roleName) {
      return { status: "unavailable" };
    }
    knownName = roleName;

    if (!CANONICAL_SECTION_LABELS.has(rawLabel)) {
      continue;
    }

    copies.push({
      sectionLabel: rawLabel,
      roleName,
      simplification: admitSimplification(selectedCopy)
    });
  }

  for (const copy of copies) {
    if (!copy.simplification) {
      return { status: "unavailable" };
    }
    return {
      status: "ready",
      value: copy.simplification,
      sectionLabel: copy.sectionLabel,
      roleName: copy.roleName
    };
  }

  return { status: "unavailable" };
}

/** Fill trusted `{token}` placeholders for first-pass copy. */
export function fillFirstPassCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
