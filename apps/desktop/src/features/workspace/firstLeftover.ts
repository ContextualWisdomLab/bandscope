import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named leftover sit-out after a partial return. */
export type FirstLeftover = {
  sectionLabel: string;
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

type NamedGraphNode = {
  roleId: string;
  roleName: string;
  active: boolean;
};

/**
 * Collect named graph nodes whose `is_active` flag is own-property evidence.
 *
 * A node with a blank role, unnamed part, inherited flag, or missing graph
 * identity is isolated instead of becoming leftover or return authority.
 */
function namedGraphNodes(sectionValue: Record<string, unknown>): NamedGraphNode[] | null {
  if (!Array.isArray(sectionValue.partGraph)) {
    return null;
  }

  const nodes: NamedGraphNode[] = [];
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
    const active = ownActiveFlag(nodeValue);
    if (active === null) {
      continue;
    }
    const roleName = namedRoleOnSection(sectionValue, roleId);
    if (!roleName) {
      continue;
    }
    nodes.push({ roleId, roleName, active });
  }
  return nodes;
}

/**
 * Pick the first leftover sit-out a player should honor after others return.
 *
 * Uses existing `partGraph` `is_active` authority already produced by
 * analysis. A leftover is the first later named section where at least one
 * previously sitting-out named part is own-property active and at least one
 * previously sitting-out named part is still own-property tacet. It is not a come-in, tacet,
 * dropout, tutti, handoff, Fine, last-line breath, a continued sit-out
 * with nobody returning, or a new dropout after every original sit-out
 * returns. Inherited `is_active`, missing graph nodes, blank
 * labels, unnamed roles, same-section false-then-true nodes, all-active
 * returns, all-tacet later sections, and malformed roots fail closed. When
 * a role is selected, only a leftover section that includes that named part
 * is shown.
 */
export function firstLeftover(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstLeftover | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  let reducedFrom: string | null = null;
  let sittingOutIds: Set<string> | null = null;

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    const nodes = namedGraphNodes(sectionValue);
    if (!nodes || nodes.length === 0) {
      continue;
    }

    const sittingOut = nodes.filter((node) => node.active === false);
    if (!reducedFrom) {
      if (sittingOut.length === 0) {
        continue;
      }
      reducedFrom = sectionLabel;
      sittingOutIds = new Set(sittingOut.map((node) => node.roleId));
      continue;
    }

    if (reducedFrom === sectionLabel || !sittingOutIds) {
      continue;
    }

    const returning = nodes.filter(
      (node) => node.active === true && sittingOutIds.has(node.roleId)
    );
    const leftover = sittingOut.find((node) => sittingOutIds.has(node.roleId));
    if (returning.length === 0 || !leftover) {
      continue;
    }
    if (activeRole && !nodes.some((node) => node.roleId === activeRole)) {
      continue;
    }

    return {
      sectionLabel,
      fromSectionLabel: reducedFrom,
      leftoverRoleId: leftover.roleId,
      leftoverRoleName: leftover.roleName
    };
  }

  return null;
}
