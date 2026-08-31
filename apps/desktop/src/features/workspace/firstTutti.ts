import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named full-band hit after a reduced section. */
export type FirstTutti = {
  sectionLabel: string;
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

type NamedRoleCatalog = Map<string, string>;

/**
 * Build trustworthy role identity evidence across the whole song.
 *
 * Production analysis deliberately keeps inactive roles out of each section's
 * `roles` array while retaining them in `partGraph`. A song-wide catalog lets
 * those inactive graph nodes remain valid reduction evidence without treating
 * an unnamed, duplicate, or contradictory role entry as authority.
 */
function namedSongRoles(songValue: Record<string, unknown>): NamedRoleCatalog | null {
  if (!Array.isArray(songValue.sections)) {
    return null;
  }

  const namedRoles: NamedRoleCatalog = new Map();
  for (const sectionValue of songValue.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      return null;
    }

    const sectionRoleIds = new Set<string>();
    for (const roleValue of sectionValue.roles) {
      if (
        !isRuntimeObject(roleValue) ||
        !Object.prototype.hasOwnProperty.call(roleValue, "id") ||
        !Object.prototype.hasOwnProperty.call(roleValue, "name")
      ) {
        return null;
      }

      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName || sectionRoleIds.has(roleId)) {
        return null;
      }
      sectionRoleIds.add(roleId);

      const knownName = namedRoles.get(roleId);
      if (knownName && knownName !== roleName) {
        return null;
      }
      namedRoles.set(roleId, roleName);
    }
  }

  return namedRoles.size >= 2 ? namedRoles : null;
}

type NamedGraphNode = {
  roleId: string;
  active: boolean;
};

/**
 * Collect a section's complete, unique graph against the song-wide role catalog.
 *
 * Every expected role needs exactly one own-property boolean activity flag.
 * Missing, unknown, duplicate, inherited, or malformed graph evidence fails
 * closed instead of manufacturing a reduction or full-band hit.
 */
function namedGraphNodes(
  sectionValue: Record<string, unknown>,
  namedRoles: NamedRoleCatalog
): NamedGraphNode[] | null {
  if (!Array.isArray(sectionValue.partGraph)) {
    return null;
  }

  const nodes: NamedGraphNode[] = [];
  const seenRoleIds = new Set<string>();
  for (const nodeValue of sectionValue.partGraph) {
    if (
      !isRuntimeObject(nodeValue) ||
      !Object.prototype.hasOwnProperty.call(nodeValue, "role_id")
    ) {
      return null;
    }

    const roleId = meaningfulRangeText(nodeValue.role_id);
    if (!roleId || !namedRoles.has(roleId) || seenRoleIds.has(roleId)) {
      return null;
    }

    const active = ownActiveFlag(nodeValue);
    if (active === null) {
      return null;
    }

    seenRoleIds.add(roleId);
    nodes.push({ roleId, active });
  }

  if (seenRoleIds.size !== namedRoles.size) {
    return null;
  }
  for (const roleId of namedRoles.keys()) {
    if (!seenRoleIds.has(roleId)) {
      return null;
    }
  }

  return nodes;
}

/**
 * Pick the first complete full-band hit a player should take after a reduction.
 *
 * Uses the existing song-wide named role evidence and each section's complete
 * `partGraph`. A reduction is a named section with at least one own-property
 * inactive role. A tutti is the first later named section where every expected
 * role has one own-property active graph node. The song's opening all-active
 * section is not returned because no earlier reduction exists. Incomplete,
 * duplicate, contradictory, inherited, unnamed, or malformed evidence fails
 * closed. When a role is selected, only a tutti containing that role is shown.
 */
export function firstTutti(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstTutti | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles) {
    return null;
  }

  let reducedFrom: string | null = null;

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      return null;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    const nodes = namedGraphNodes(sectionValue, namedRoles);
    if (!nodes) {
      return null;
    }

    const sittingOut = nodes.some((node) => node.active === false);
    if (sittingOut) {
      if (!reducedFrom) {
        reducedFrom = sectionLabel;
      }
      continue;
    }

    if (!reducedFrom) {
      continue;
    }
    if (nodes.some((node) => node.active !== true)) {
      continue;
    }
    if (activeRole && !nodes.some((node) => node.roleId === activeRole)) {
      continue;
    }

    return { sectionLabel, fromSectionLabel: reducedFrom };
  }

  return null;
}