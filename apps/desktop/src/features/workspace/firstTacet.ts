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
 * Resolve one role name from trustworthy song-wide role metadata.
 *
 * Production analysis keeps inactive parts in `partGraph` but omits them from
 * that section's active-only `roles` list. Search every section for an own
 * `roles` array and accept only own, meaningful id/name fields. Inherited,
 * blank, malformed, or contradictory metadata cannot become display guidance.
 */
function namedRoleOnSong(songValue: Record<string, unknown>, roleId: string): string | undefined {
  if (!Array.isArray(songValue.sections)) {
    return undefined;
  }

  let roleName: string | undefined;
  for (const sectionValue of songValue.sections) {
    if (
      !isRuntimeObject(sectionValue) ||
      !Object.prototype.hasOwnProperty.call(sectionValue, "roles") ||
      !Array.isArray(sectionValue.roles)
    ) {
      continue;
    }
    for (const roleValue of sectionValue.roles) {
      if (
        !isRuntimeObject(roleValue) ||
        !Object.prototype.hasOwnProperty.call(roleValue, "id") ||
        !Object.prototype.hasOwnProperty.call(roleValue, "name") ||
        meaningfulRangeText(roleValue.id) !== roleId
      ) {
        continue;
      }
      const candidate = meaningfulRangeText(roleValue.name);
      if (!candidate) {
        continue;
      }
      if (roleName && roleName !== candidate) {
        return undefined;
      }
      roleName = candidate;
    }
  }
  return roleName;
}

/**
 * Pick the first explicit sit-out a player should honor before playing.
 *
 * Uses existing `partGraph` `is_active: false` authority already produced by
 * analysis and resolves the role name from trustworthy song-wide metadata so
 * production-shaped inactive nodes remain nameable. Inherited or missing
 * activity flags, inherited role arrays, missing graph nodes, blank labels,
 * unnamed or contradictory roles, and malformed roots fail closed. When a
 * role is selected, only that part's own-property sit-out is named.
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
      const roleName = namedRoleOnSong(song, roleId);
      if (!roleName) {
        continue;
      }
      return { sectionLabel, roleName };
    }
  }

  return null;
}