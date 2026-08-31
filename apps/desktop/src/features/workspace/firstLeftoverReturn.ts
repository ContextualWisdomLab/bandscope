import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named leftover return after a leftover sit-out. */
export type FirstLeftoverReturn = {
  sectionLabel: string;
  leftoverSectionLabel: string;
  fromSectionLabel: string;
  leftoverRoleId: string;
  leftoverRoleName: string;
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
 * Production analysis emits active-only section `roles` while keeping inactive
 * identities in `partGraph`. The song-wide catalog therefore lets a leftover
 * part keep its trustworthy display name across the sit-out and the return.
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

  return namedRoles.size > 0 ? namedRoles : null;
}

type NamedGraphNode = {
  roleId: string;
  active: boolean;
};

/**
 * Collect one complete, unique activity record for every song-wide named role.
 *
 * Missing, unknown, duplicate, inherited, or non-boolean graph evidence fails
 * closed so a leftover part cannot be both sitting out and returning in the
 * same section.
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

  return seenRoleIds.size === namedRoles.size ? nodes : null;
}

type PendingLeftover = {
  leftoverSectionLabel: string;
  fromSectionLabel: string;
  leftoverRoleId: string;
  leftoverRoleName: string;
};

/**
 * Pick the first leftover return a player should honor after a leftover sit-out.
 *
 * A leftover sit-out is the first later named section where at least one member
 * of the current reduced cohort has returned and at least one remains out. The
 * leftover return is the first named section after that leftover sit-out where
 * the leftover part is own-property active. A tutti, come-in, continued sit-out,
 * or a new dropout after a full original return is not a leftover return.
 *
 * Inherited/missing activity, incomplete or contradictory graphs, unnamed
 * roles, and malformed runtime data fail closed. When a role is selected, a
 * leftover return is shown only after a leftover sit-out that includes that
 * named part, so a silent new dropout is never told to come back.
 */
export function firstLeftoverReturn(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstLeftoverReturn | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles || (activeRole && !namedRoles.has(activeRole))) {
    return null;
  }

  let reducedFrom: string | null = null;
  let sittingOutIds: Set<string> | null = null;
  let pending: PendingLeftover | null = null;

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

    if (pending) {
      const leftoverNode = nodes.find((node) => node.roleId === pending.leftoverRoleId);
      if (!leftoverNode) {
        return null;
      }
      if (leftoverNode.active) {
        return {
          sectionLabel,
          leftoverSectionLabel: pending.leftoverSectionLabel,
          fromSectionLabel: pending.fromSectionLabel,
          leftoverRoleId: pending.leftoverRoleId,
          leftoverRoleName: pending.leftoverRoleName
        };
      }
      continue;
    }

    const sittingOut = nodes.filter((node) => node.active === false);
    if (!sittingOutIds || !reducedFrom) {
      if (sittingOut.length === 0) {
        continue;
      }
      reducedFrom = sectionLabel;
      sittingOutIds = new Set(sittingOut.map((node) => node.roleId));
      continue;
    }

    const baselineIds = sittingOutIds;
    const returning = nodes.filter(
      (node) => node.active === true && baselineIds.has(node.roleId)
    );
    const leftovers = sittingOut.filter((node) => baselineIds.has(node.roleId));

    if (returning.length > 0 && leftovers.length > 0) {
      let leftover = leftovers[0]!;
      if (activeRole) {
        const activeRoleNode = nodes.find((node) => node.roleId === activeRole);
        if (!activeRoleNode) {
          return null;
        }
        if (!activeRoleNode.active) {
          const selectedLeftover = leftovers.find((node) => node.roleId === activeRole);
          if (!selectedLeftover) {
            continue;
          }
          leftover = selectedLeftover;
        }
      }
      pending = {
        leftoverSectionLabel: sectionLabel,
        fromSectionLabel: reducedFrom,
        leftoverRoleId: leftover.roleId,
        leftoverRoleName: namedRoles.get(leftover.roleId)!
      };
      continue;
    }

    if (returning.length === baselineIds.size && leftovers.length === 0) {
      if (sittingOut.length === 0) {
        reducedFrom = null;
        sittingOutIds = null;
      } else {
        reducedFrom = sectionLabel;
        sittingOutIds = new Set(sittingOut.map((node) => node.roleId));
      }
    }
  }

  return null;
}
