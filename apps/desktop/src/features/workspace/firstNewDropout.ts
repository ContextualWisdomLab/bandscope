import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named new dropout after a leftover return. */
export type FirstNewDropout = {
  sectionLabel: string;
  returnSectionLabel: string;
  fromSectionLabel: string;
  dropoutRoleId: string;
  dropoutRoleName: string;
  sectionIndex: number;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit an own data-property boolean `is_active` flag.
 *
 * Inherited members, own accessors, and Proxy get-traps cannot substitute
 * buyer-visible sit-out evidence.
 */
function ownActiveFlag(value: Record<string, unknown>): boolean | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, "is_active");
  if (!descriptor || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
    return null;
  }
  if (descriptor.value === true) {
    return true;
  }
  if (descriptor.value === false) {
    return false;
  }
  return null;
}

/** Reject sparse arrays so a hole cannot stand in for a named graph node. */
function denseOwnArray(value: unknown): unknown[] | null {
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

type NamedRoleCatalog = Map<string, string>;

/**
 * Build trustworthy role identity evidence across the whole song.
 *
 * Production analysis emits active-only section `roles` while keeping inactive
 * identities in `partGraph`. The song-wide catalog therefore lets a newly
 * sitting-out part keep its trustworthy display name after leftover parts return.
 */
function namedSongRoles(songValue: Record<string, unknown>): NamedRoleCatalog | null {
  const sections = denseOwnArray(songValue.sections);
  if (!sections) {
    return null;
  }

  const namedRoles: NamedRoleCatalog = new Map();
  for (const sectionValue of sections) {
    if (!isRuntimeObject(sectionValue)) {
      return null;
    }
    const roles = denseOwnArray(sectionValue.roles);
    if (!roles) {
      return null;
    }

    const sectionRoleIds = new Set<string>();
    for (const roleValue of roles) {
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
 * Missing, unknown, duplicate, inherited, accessor, Proxy, sparse, or
 * non-boolean graph evidence fails closed so a leftover part cannot also
 * count as tonight's new dropout in the same section.
 */
function namedGraphNodes(
  sectionValue: Record<string, unknown>,
  namedRoles: NamedRoleCatalog
): NamedGraphNode[] | null {
  const partGraph = denseOwnArray(sectionValue.partGraph);
  if (!partGraph) {
    return null;
  }

  const nodes: NamedGraphNode[] = [];
  const seenRoleIds = new Set<string>();
  for (const nodeValue of partGraph) {
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

/** Return true only when every trustworthy named graph section keeps every role active. */
export function hasTrustworthyAllActiveTimeline(song: RehearsalSong | unknown): boolean {
  if (!isRuntimeObject(song)) {
    return false;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles) {
    return false;
  }

  let sawNamedSection = false;
  for (const sectionValue of song.sections as unknown[]) {
    const record = sectionValue as Record<string, unknown>;
    const sectionLabel = meaningfulRangeText(record.label);
    if (!sectionLabel) {
      continue;
    }

    const nodes = namedGraphNodes(record, namedRoles);
    if (!nodes) {
      return false;
    }
    sawNamedSection = true;
    if (nodes.some((node) => !node.active)) {
      return false;
    }
  }

  return sawNamedSection;
}

type PendingReturn = {
  returnSectionLabel: string;
  fromSectionLabel: string;
  activeAtReturn: Set<string>;
};

function namedDropout(
  candidates: NamedGraphNode[],
  nodes: NamedGraphNode[],
  namedRoles: NamedRoleCatalog,
  activeRole: string | null,
  sectionLabel: string,
  returnSectionLabel: string,
  fromSectionLabel: string,
  sectionIndex: number
): FirstNewDropout | "continue" {
  let dropout = candidates[0];
  if (activeRole) {
    const activeRoleNode = nodes.find((node) => node.roleId === activeRole)!;
    if (!activeRoleNode.active) {
      dropout = candidates.find((node) => node.roleId === activeRole);
    }
  }
  if (!dropout) {
    return "continue";
  }

  return {
    sectionLabel,
    returnSectionLabel,
    fromSectionLabel,
    dropoutRoleId: dropout.roleId,
    dropoutRoleName: namedRoles.get(dropout.roleId)!,
    sectionIndex
  };
}

/**
 * Pick the first new dropout a player should honor after leftover parts return.
 *
 * A leftover return here is a later named section where every member of the
 * current reduced cohort is own-property active. A new dropout is a named part
 * that was not in that reduced cohort and is own-property tacet either in that
 * leftover-return section or in a later named section. A leftover sit-out,
 * remaining leftover, come-in, tacet, tutti, continued sit-out, or a dropout
 * that starts before leftover parts have all returned is not a new dropout.
 *
 * Inherited/missing activity, own accessors, Proxy get-traps, sparse arrays,
 * incomplete or contradictory graphs, unnamed roles, and malformed runtime
 * data fail closed. When a role is selected, a new dropout is shown only after
 * a leftover return that includes that named part, so a leftover sit-out is
 * never told to stay out as a new dropout.
 */
export function firstNewDropout(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstNewDropout | null {
  if (!isRuntimeObject(song)) {
    return null;
  }
  const sections = denseOwnArray(song.sections);
  if (!sections) {
    return null;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles || (activeRole && !namedRoles.has(activeRole))) {
    return null;
  }

  let reducedFrom: string | null = null;
  let sittingOutIds: Set<string> | null = null;
  let pendingReturn: PendingReturn | null = null;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const sectionValue = sections[sectionIndex] as Record<string, unknown>;
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    const nodes = namedGraphNodes(sectionValue, namedRoles);
    if (!nodes) {
      return null;
    }

    if (pendingReturn) {
      const awaiting = pendingReturn;
      const newDropouts = nodes.filter(
        (node) => awaiting.activeAtReturn.has(node.roleId) && node.active === false
      );
      const found = namedDropout(
        newDropouts,
        nodes,
        namedRoles,
        activeRole,
        sectionLabel,
        awaiting.returnSectionLabel,
        awaiting.fromSectionLabel,
        sectionIndex
      );
      if (found === "continue") {
        continue;
      }
      return found;
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

    if (returning.length === baselineIds.size && leftovers.length === 0) {
      const newDropouts = sittingOut.filter((node) => !baselineIds.has(node.roleId));
      const found = namedDropout(
        newDropouts,
        nodes,
        namedRoles,
        activeRole,
        sectionLabel,
        sectionLabel,
        reducedFrom,
        sectionIndex
      );
      if (found !== "continue") {
        return found;
      }

      pendingReturn = {
        returnSectionLabel: sectionLabel,
        fromSectionLabel: reducedFrom,
        activeAtReturn: new Set(nodes.filter((node) => node.active).map((node) => node.roleId))
      };
      reducedFrom = null;
      sittingOutIds = null;
      continue;
    }
  }

  return null;
}
