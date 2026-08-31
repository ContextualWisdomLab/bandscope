import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named return after an explicit sit-out. */
export type FirstComeIn = {
  sectionLabel: string;
  roleName: string;
  fromSectionLabel: string;
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

type SitOutEvidence = {
  sectionIndex: number;
  sectionLabel: string;
};

/**
 * Pick the first explicit return a player should take after sitting out.
 *
 * Uses existing `partGraph` `is_active` authority already produced by
 * analysis. A come-in is the first later named section where a part that
 * sat out (`is_active: false`) is own-property active again. Section identity
 * is tracked by iteration index so repeated form labels remain valid later
 * returns while false/true evidence inside one section is rejected. Inherited
 * `is_active`, missing graph nodes, blank labels, unnamed roles, and malformed
 * roots fail closed. When a role is selected, only that part's return is named.
 */
export function firstComeIn(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstComeIn | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  const sittingOut = new Map<string, SitOutEvidence>();

  for (const [sectionIndex, sectionValue] of song.sections.entries()) {
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

      const activeFlag = ownActiveFlag(nodeValue);
      if (activeFlag === false) {
        if (!sittingOut.has(roleId)) {
          sittingOut.set(roleId, { sectionIndex, sectionLabel });
        }
        continue;
      }
      if (activeFlag !== true) {
        continue;
      }

      const sitOut = sittingOut.get(roleId);
      if (!sitOut || sitOut.sectionIndex === sectionIndex) {
        continue;
      }

      const roleName = namedRoleOnSection(sectionValue, roleId);
      if (!roleName) {
        continue;
      }

      return { sectionLabel, roleName, fromSectionLabel: sitOut.sectionLabel };
    }
  }

  return null;
}