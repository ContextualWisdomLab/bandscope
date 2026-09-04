import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named leftover last-dropout after leftover last-return. */
export type FirstLeftoverLastDropout = {
  sectionLabel: string;
  lastReturnSectionLabel: string;
  remainingSectionLabel: string;
  leftoverSectionLabel: string;
  fromSectionLabel: string;
  dropoutRoleId: string;
  dropoutRoleName: string;
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
 * leftover, leftover last-return, and leftover last-dropout.
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
 * closed so a leftover part cannot be both last-returning and dropping in the
 * same leftover last-dropout decision.
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

type PendingLastReturn = {
  leftoverSectionLabel: string;
  remainingSectionLabel: string;
  lastReturnSectionLabel: string;
  fromSectionLabel: string;
  leftoverIds: string[];
  remainingIds: string[];
  originalSitOutIds: string[];
  lastRoleId: string;
};

/**
 * Return whether the selected part belongs to this leftover last-dropout.
 *
 * A leftover last-dropout is shown only after a leftover last-return whose
 * original sit-out, leftover, remaining leftover, last leftover, or dropping
 * named part includes that selected part, so a silent always-active part is
 * never told to count someone out.
 */
function selectedPartBelongs(
  pending: PendingLastReturn,
  dropoutRoleId: string,
  activeRole: string | null
): boolean {
  if (!activeRole) {
    return true;
  }
  return (
    pending.originalSitOutIds.includes(activeRole) ||
    pending.leftoverIds.includes(activeRole) ||
    pending.remainingIds.includes(activeRole) ||
    pending.lastRoleId === activeRole ||
    dropoutRoleId === activeRole
  );
}

/**
 * Pick the first leftover last-dropout a player should honor after leftover last-return.
 *
 * A leftover sit-out is the first later named section where at least one member
 * of the current reduced cohort has returned and at least one remains out. A
 * leftover return with remaining leftover is the first named section after that
 * leftover sit-out where at least one leftover part is own-property active and
 * at least one leftover remains own-property tacet. A leftover last-return is
 * the first later named section where every remaining leftover is own-property
 * active. A leftover last-dropout is the first later named section after that
 * leftover last-return where at least one named part is own-property tacet.
 * A leftover last-return, remaining leftover, leftover sit-out, leftover return,
 * come-in, tacet, tutti, new dropout after remaining leftover, or leftover
 * last-return without a later sit-out is not a leftover last-dropout.
 *
 * Inherited/missing activity, incomplete or contradictory graphs, unnamed
 * roles, and malformed runtime data fail closed. When a role is selected, a
 * leftover last-dropout is shown only after a leftover last-return that includes
 * that named part or a later sit-out of that named part.
 */
export function firstLeftoverLastDropout(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstLeftoverLastDropout | null {
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
  let pendingLastReturn: PendingLastReturn | null = null;

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

    if (pendingLastReturn) {
      if (sittingOut.length === 0) {
        continue;
      }

      let dropout = sittingOut[0]!;
      if (activeRole) {
        const selectedDropout = sittingOut.find((node) => node.roleId === activeRole);
        if (selectedDropout) {
          dropout = selectedDropout;
        } else if (!selectedPartBelongs(pendingLastReturn, dropout.roleId, activeRole)) {
          continue;
        }
      }

      return {
        sectionLabel,
        lastReturnSectionLabel: pendingLastReturn.lastReturnSectionLabel,
        remainingSectionLabel: pendingLastReturn.remainingSectionLabel,
        leftoverSectionLabel: pendingLastReturn.leftoverSectionLabel,
        fromSectionLabel: pendingLastReturn.fromSectionLabel,
        dropoutRoleId: dropout.roleId,
        dropoutRoleName: namedRoles.get(dropout.roleId)!
      };
    }

    if (pendingRemaining) {
      const remainingNodes: NamedGraphNode[] = [];
      for (const remainingId of pendingRemaining.remainingIds) {
        const remainingNode = nodes.find((node) => node.roleId === remainingId);
        if (!remainingNode) {
          return null;
        }
        remainingNodes.push(remainingNode);
      }

      const trackedRemainingIds = new Set(pendingRemaining.remainingIds);
      if (sittingOut.some((node) => !trackedRemainingIds.has(node.roleId))) {
        pendingRemaining = null;
        reducedFrom = sectionLabel;
        sittingOutIds = new Set(sittingOut.map((node) => node.roleId));
        continue;
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
          const selectedLast = returningLast.find((node) => node.roleId === activeRole);
          if (selectedLast) {
            last = selectedLast;
          }
        }
        pendingLastReturn = {
          leftoverSectionLabel: pendingRemaining.leftoverSectionLabel,
          remainingSectionLabel: pendingRemaining.remainingSectionLabel,
          lastReturnSectionLabel: sectionLabel,
          fromSectionLabel: pendingRemaining.fromSectionLabel,
          leftoverIds: pendingRemaining.leftoverIds,
          remainingIds: pendingRemaining.remainingIds,
          originalSitOutIds: pendingRemaining.originalSitOutIds,
          lastRoleId: last.roleId
        };
        pendingRemaining = null;
        continue;
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
