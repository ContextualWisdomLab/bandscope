import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named leftover last-dropout remaining last-return. */
export type FirstLeftoverLastDropoutRemainingLastReturn = {
  sectionLabel: string;
  remainingSectionLabel: string;
  dropoutSectionLabel: string;
  lastReturnSectionLabel: string;
  leftoverSectionLabel: string;
  fromSectionLabel: string;
  remainingRoleId: string;
  remainingRoleName: string;
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
 * identities in `partGraph`. The song-wide catalog therefore lets leftover
 * last-dropout remaining last-return keep its trustworthy display name across
 * leftover sit-out, remaining leftover, leftover last-return, leftover
 * last-dropout, leftover last-dropout remaining, and leftover last-dropout
 * remaining last-return.
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
 * closed so leftover last-dropout remaining cannot be both remaining and
 * returning in the same leftover last-dropout remaining last-return decision.
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

type PendingDropout = {
  leftoverSectionLabel: string;
  remainingSectionLabel: string;
  lastReturnSectionLabel: string;
  dropoutSectionLabel: string;
  fromSectionLabel: string;
  leftoverIds: string[];
  remainingIds: string[];
  originalSitOutIds: string[];
  lastRoleId: string;
  dropoutIds: string[];
};

type PendingRemainingDropout = {
  leftoverSectionLabel: string;
  remainingSectionLabel: string;
  lastReturnSectionLabel: string;
  dropoutSectionLabel: string;
  remainingDropoutSectionLabel: string;
  fromSectionLabel: string;
  leftoverIds: string[];
  remainingIds: string[];
  originalSitOutIds: string[];
  lastRoleId: string;
  dropoutIds: string[];
  remainingDropoutIds: string[];
  returningDropoutIds: string[];
};

/**
 * Return whether the selected part belongs to this leftover last-dropout
 * remaining last-return.
 *
 * A leftover last-dropout remaining last-return is shown only after leftover
 * last-dropout remaining whose original sit-out, leftover, remaining leftover,
 * last leftover, leftover last-dropout, leftover last-dropout remaining, or
 * leftover last-dropout remaining last-return includes that selected part, so a
 * silent always-active part is never told to count someone in.
 */
function selectedPartBelongs(pending: PendingRemainingDropout, activeRole: string | null): boolean {
  if (!activeRole) {
    return true;
  }
  return (
    pending.originalSitOutIds.includes(activeRole) ||
    pending.leftoverIds.includes(activeRole) ||
    pending.remainingIds.includes(activeRole) ||
    pending.lastRoleId === activeRole ||
    pending.dropoutIds.includes(activeRole) ||
    pending.remainingDropoutIds.includes(activeRole) ||
    pending.returningDropoutIds.includes(activeRole)
  );
}

/**
 * Pick the first leftover last-dropout remaining last-return a player should honor.
 *
 * A leftover sit-out is the first later named section where at least one member
 * of the current reduced cohort has returned and at least one remains out. A
 * leftover return with remaining leftover is the first named section after that
 * leftover sit-out where at least one leftover part is own-property active and
 * at least one leftover remains own-property tacet. A leftover last-return is
 * the first later named section where every remaining leftover is own-property
 * active. A leftover last-dropout is the first later named section after that
 * leftover last-return where at least two named parts are own-property tacet.
 * A leftover last-dropout remaining is the first later named section after that
 * leftover last-dropout where at least one leftover last-dropout named part is
 * own-property active and at least one leftover last-dropout remains
 * own-property tacet. A leftover last-dropout remaining last-return is the first
 * later named section after leftover last-dropout remaining where every leftover
 * last-dropout remaining named part is own-property active. Leftover last-dropout
 * remaining, leftover last-dropout, leftover last-dropout return with nobody
 * still out, leftover last-return, remaining leftover, leftover sit-out,
 * leftover return, come-in, tacet, tutti, new dropout after remaining leftover,
 * leftover last-dropout without leftover last-dropout remaining, or a singleton
 * leftover last-dropout is not leftover last-dropout remaining last-return.
 *
 * Inherited/missing activity, incomplete or contradictory graphs, unnamed
 * roles, and malformed runtime data fail closed. When a role is selected, a
 * leftover last-dropout remaining last-return is shown only after leftover
 * last-dropout remaining that includes that named part or leftover last-dropout
 * remaining last-return of that named part.
 */
export function firstLeftoverLastDropoutRemainingLastReturn(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstLeftoverLastDropoutRemainingLastReturn | null {
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
  let pendingDropout: PendingDropout | null = null;
  let pendingRemainingDropout: PendingRemainingDropout | null = null;

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

    if (pendingRemainingDropout) {
      const remaining: PendingRemainingDropout = pendingRemainingDropout;
      const remainingNodes = remaining.remainingDropoutIds.map((remainingId) =>
        nodes.find((node) => node.roleId === remainingId)
      );
      if (remainingNodes.some((node) => !node)) {
        return null;
      }

      const returningLast = remainingNodes.filter((node) => node!.active);
      const stillRemaining = remainingNodes.filter((node) => node!.active === false);

      if (returningLast.length > 0 && stillRemaining.length === 0) {
        if (returningLast.length !== 1) {
          return null;
        }
        let last = returningLast[0]!;
        if (activeRole) {
          if (!selectedPartBelongs(remaining, activeRole)) {
            continue;
          }
          const selectedLast = returningLast.find((node) => node!.roleId === activeRole);
          if (selectedLast) {
            last = selectedLast;
          }
        }
        return {
          sectionLabel,
          remainingSectionLabel: remaining.remainingDropoutSectionLabel,
          dropoutSectionLabel: remaining.dropoutSectionLabel,
          lastReturnSectionLabel: remaining.lastReturnSectionLabel,
          leftoverSectionLabel: remaining.leftoverSectionLabel,
          fromSectionLabel: remaining.fromSectionLabel,
          remainingRoleId: last.roleId,
          remainingRoleName: namedRoles.get(last.roleId)!
        };
      }

      if (returningLast.length > 0 && stillRemaining.length > 0) {
        pendingRemainingDropout = {
          ...remaining,
          remainingDropoutIds: stillRemaining.map((node) => node!.roleId)
        };
      }
      continue;
    }

    if (pendingDropout) {
      const dropout = pendingDropout;
      const dropoutNodes = dropout.dropoutIds.map((dropoutId) =>
        nodes.find((node) => node.roleId === dropoutId)
      );
      if (dropoutNodes.some((node) => !node)) {
        return null;
      }

      const returningDropouts = dropoutNodes.filter((node) => node!.active);
      const remainingDropouts = dropoutNodes.filter((node) => node!.active === false);

      if (returningDropouts.length > 0 && remainingDropouts.length > 0) {
        if (activeRole) {
          const selectedDropout = remainingDropouts.find((node) => node!.roleId === activeRole);
          if (
            !selectedDropout &&
            !dropout.originalSitOutIds.includes(activeRole) &&
            !dropout.leftoverIds.includes(activeRole) &&
            !dropout.remainingIds.includes(activeRole) &&
            dropout.lastRoleId !== activeRole &&
            !dropout.dropoutIds.includes(activeRole)
          ) {
            continue;
          }
        }
        pendingRemainingDropout = {
          leftoverSectionLabel: dropout.leftoverSectionLabel,
          remainingSectionLabel: dropout.remainingSectionLabel,
          lastReturnSectionLabel: dropout.lastReturnSectionLabel,
          dropoutSectionLabel: dropout.dropoutSectionLabel,
          remainingDropoutSectionLabel: sectionLabel,
          fromSectionLabel: dropout.fromSectionLabel,
          leftoverIds: dropout.leftoverIds,
          remainingIds: dropout.remainingIds,
          originalSitOutIds: dropout.originalSitOutIds,
          lastRoleId: dropout.lastRoleId,
          dropoutIds: dropout.dropoutIds,
          remainingDropoutIds: remainingDropouts.map((node) => node!.roleId),
          returningDropoutIds: returningDropouts.map((node) => node!.roleId)
        };
        pendingDropout = null;
        continue;
      }

      if (returningDropouts.length > 0 && remainingDropouts.length === 0) {
        pendingDropout = null;
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

    if (pendingLastReturn) {
      if (sittingOut.length === 0) {
        continue;
      }

      if (sittingOut.length < 2) {
        pendingLastReturn = null;
        reducedFrom = sectionLabel;
        sittingOutIds = new Set(sittingOut.map((node) => node.roleId));
        continue;
      }

      if (activeRole) {
        const selectedDropout = sittingOut.find((node) => node.roleId === activeRole);
        if (
          !selectedDropout &&
          !pendingLastReturn.originalSitOutIds.includes(activeRole) &&
          !pendingLastReturn.leftoverIds.includes(activeRole) &&
          !pendingLastReturn.remainingIds.includes(activeRole) &&
          pendingLastReturn.lastRoleId !== activeRole
        ) {
          continue;
        }
      }

      pendingDropout = {
        leftoverSectionLabel: pendingLastReturn.leftoverSectionLabel,
        remainingSectionLabel: pendingLastReturn.remainingSectionLabel,
        lastReturnSectionLabel: pendingLastReturn.lastReturnSectionLabel,
        dropoutSectionLabel: sectionLabel,
        fromSectionLabel: pendingLastReturn.fromSectionLabel,
        leftoverIds: pendingLastReturn.leftoverIds,
        remainingIds: pendingLastReturn.remainingIds,
        originalSitOutIds: pendingLastReturn.originalSitOutIds,
        lastRoleId: pendingLastReturn.lastRoleId,
        dropoutIds: sittingOut.map((node) => node.roleId)
      };
      pendingLastReturn = null;
      continue;
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

      const returningLast = remainingNodes.filter((node) => node.active);
      const stillRemaining = remainingNodes.filter((node) => node.active === false);

      if (returningLast.length > 0 && stillRemaining.length === 0) {
        if (sittingOut.length > 0) {
          return null;
        }
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
