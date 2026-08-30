import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named sit-out the selected part should take. */
export type FirstTacet = {
  sectionLabel: string;
  roleName: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Admit an own-property boolean `is_active` flag. Inherited evidence is isolated. */
function ownActiveFlag(value: Record<string, unknown>): boolean | null {
  if (!Object.prototype.hasOwnProperty.call(value, "is_active")) {
    return null;
  }
  if (value.is_active === true) {
    return true;
  }
  if (value.is_active === false) {
    return false;
  }
  return null;
}

/**
 * Resolve a named role from a section's own-property `roles` list.
 *
 * Blank, `none`, inherited, or non-string names are not rehearsal authority.
 */
function namedRoleOnSection(
  sectionValue: Record<string, unknown>,
  roleId: string
): string | undefined {
  if (!Array.isArray(sectionValue.roles)) {
    return undefined;
  }
  for (const roleValue of sectionValue.roles) {
    if (!isRuntimeObject(roleValue) || !Object.prototype.hasOwnProperty.call(roleValue, "id")) {
      continue;
    }
    if (meaningfulRangeText(roleValue.id) !== roleId) {
      continue;
    }
    return meaningfulRangeText(
      Object.prototype.hasOwnProperty.call(roleValue, "name") ? roleValue.name : undefined
    );
  }
  return undefined;
}

/**
 * Pick the first explicit sit-out a player should honor before playing.
 *
 * Uses existing `partGraph` `is_active: false` authority already produced by
 * analysis. This is a tacet: the part does not play the named section. It is
 * not a dropout (leaving after playing), handoff, Fine, or first breath.
 * Inherited `is_active`, missing graph nodes, blank labels, and malformed
 * roots fail closed. When a role is selected, only that part's own-property
 * sit-out is named.
 */
export function firstTacet(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstTacet | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }
    if (!Array.isArray(sectionValue.partGraph)) {
      continue;
    }

    for (const nodeValue of sectionValue.partGraph) {
      if (
        !isRuntimeObject(nodeValue) ||
        !Object.prototype.hasOwnProperty.call(nodeValue, "role_id")
      ) {
        continue;
      }
      const roleId = meaningfulRangeText(nodeValue.role_id);
      if (!roleId) {
        continue;
      }
      if (activeRole && roleId !== activeRole) {
        continue;
      }
      if (ownActiveFlag(nodeValue) !== false) {
        continue;
      }
      const roleName = namedRoleOnSection(sectionValue, roleId);
      if (!roleName) {
        continue;
      }
      return { sectionLabel, roleName };
    }
  }

  return null;
}
