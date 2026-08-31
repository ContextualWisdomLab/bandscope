import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named leftover last-return after remaining leftover. */
export type FirstLeftoverLastReturn = {
  sectionLabel: string;
  remainingSectionLabel: string;
  leftoverSectionLabel: string;
  fromSectionLabel: string;
  lastRoleId: string;
  lastRoleName: string;
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
 * part keep its trustworthy display name across leftover sit-out, remaining
 * leftover, and leftover last-return.
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
 * closed so a leftover part cannot be both remaining and last-returning in the
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

type PendingLeftoverSitOut = {
  leftoverSectionLabel: string;
  fromSectionLabel: string;
  leftoverIds: string[];
  originalSitOutIds: string[];
};

type PendingRemainingLeftover = {
  leftoverSectionLabel: string;
  remainingSectionLabel: string;
  fromSectionLabel: string;
  leftoverIds: string[];
  remainingIds: string[];
  originalSitOutIds: string[];
};

/**
 * Return whether the selected part belongs to this leftover last-return.
 *
 * A leftover last-return is shown only after a leftover sit-out whose original
 * sit-out, leftover, remaining leftover, or last leftover includes that named
 * part, so a silent always-active part is never told to count someone in.
 */
function selectedPartBelongs(
  pending: PendingRemainingLeftover,
  lastRoleId: string,
  activeRole: string | null
): boolean {
  if (!activeRole) {
    return true;
  }
  return (
    pending.originalSitOutIds.includes(activeRole) ||
    pending.leftoverIds.includes(activeRole) ||
    pending.remainingIds.includes(activeRole) ||
    lastRoleId === activeRole
  );
}

/**
 * Pick the first leftover last-return a player should honor after remaining leftover.
 *
 * A leftover sit-out is the first later named section where at least one member
 * of the current reduced cohort has returned and at least one remains out. A
 * leftover return with remaining leftover is the first named section after that
 * leftover sit-out where at least one leftover part is own-property active and
 * at least one leftover remains own-property tacet. A leftover last-return is
 * the first later named section where every remaining leftover is own-property
 * active. A leftover return with nobody still out, a remaining leftover with
 * nobody coming back last, a come-in, tacet, leftover sit-out, leftover return,
 * tutti, continued remaining leftover, or a new dropout after remaining leftover
 * is not a leftover last-return.
 *
 * Inherited/missing activity, incomplete or contradictory graphs, unnamed
 * roles, and malformed runtime data fail closed. When a role is selected, a
 * leftover last-return is shown only after a leftover sit-out that includes
 * that named part, so a silent new dropout is never told to come in last.
 */
export function firstLeftoverLastReturn(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstLeftoverLastReturn | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles || (activeRole && !namedRoles.has(activeRole))) {
    return null;
  }

  let reducedFrom: string | null = null;
  let sittingOutIds: Set<string> | null = null;
  let pendingSitOut: PendingLeftoverSitOut | null = null;
  let pendingRemaining: PendingRemainingLeftover | null = null;

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

    const sittingOut = nodes.filter((node) => node.active === false);

    if (pendingRemaining) {
      const remainingNodes: NamedGraphNode[] = [];
      for (const remainingId of pendingRemaining.remainingIds) {
        const remainingNode = nodes.find((node) => node.roleId === remainingId);
        if (!remainingNode) {
          return null;
        }
        remainingNodes.push(remainingNode);
      }

      const returningLast = remainingNodes.filter((node) => node.active);
      const stillRemaining = remainingNodes.filter((node) => node.active === false);

      if (returningLast.length > 0 && stillRemaining.length === 0) {
        let last = returningLast[0]!;
        if (activeRole) {
          const activeRoleNode = nodes.find((node) => node.roleId === activeRole);
          if (!activeRoleNode) {
            return null;
          }
          if (!activeRoleNode.active) {
            const selectedLast = returningLast.find((node) => node.roleId === activeRole);
            if (!selectedLast) {
              continue;
            }
            last = selectedLast;
          }
          if (!selectedPartBelongs(pendingRemaining, last.roleId, activeRole)) {
            continue;
          }
        }
        return {
          sectionLabel,
          remainingSectionLabel: pendingRemaining.remainingSectionLabel,
          leftoverSectionLabel: pendingRemaining.leftoverSectionLabel,
          fromSectionLabel: pendingRemaining.fromSectionLabel,
          lastRoleId: last.roleId,
          lastRoleName: namedRoles.get(last.roleId)!
        };
      }

      if (returningLast.length > 0 && stillRemaining.length > 0) {
        pendingRemaining = {
          leftoverSectionLabel: pendingRemaining.leftoverSectionLabel,
          remainingSectionLabel: sectionLabel,
          fromSectionLabel: pendingRemaining.fromSectionLabel,
          leftoverIds: pendingRemaining.leftoverIds,
          remainingIds: stillRemaining.map((node) => node.roleId),
          originalSitOutIds: pendingRemaining.originalSitOutIds
        };
      }
      continue;
    }

    if (pendingSitOut) {
      const leftoverNodes = pendingSitOut.leftoverIds.map((leftoverId) =>
        nodes.find((node) => node.roleId === leftoverId)
      );
      if (leftoverNodes.some((node) => !node)) {
        return null;
      }

      const returningLeftovers = leftoverNodes.filter((node) => node!.active);
      const remainingLeftovers = leftoverNodes.filter((node) => node!.active === false);

      if (returningLeftovers.length > 0 && remainingLeftovers.length > 0) {
        pendingRemaining = {
          leftoverSectionLabel: pendingSitOut.leftoverSectionLabel,
          remainingSectionLabel: sectionLabel,
          fromSectionLabel: pendingSitOut.fromSectionLabel,
          leftoverIds: pendingSitOut.leftoverIds,
          remainingIds: remainingLeftovers.map((node) => node!.roleId),
          originalSitOutIds: pendingSitOut.originalSitOutIds
        };
        pendingSitOut = null;
        continue;
      }

      if (returningLeftovers.length > 0 && remainingLeftovers.length === 0) {
        pendingSitOut = null;
        if (sittingOut.length === 0) {
          reducedFrom = null;
          sittingOutIds = null;
        } else {
          reducedFrom = sectionLabel;
          sittingOutIds = new Set(sittingOut.map((node) => node.roleId));
        }
      }
      continue;
    }

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
      pendingSitOut = {
        leftoverSectionLabel: sectionLabel,
        fromSectionLabel: reducedFrom,
        leftoverIds: leftovers.map((node) => node.roleId),
        originalSitOutIds: [...baselineIds]
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
