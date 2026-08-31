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
  active: boolean;
};

/**
 * Collect named graph nodes whose `is_active` flag is own-property evidence.
 *
 * A node with a blank role, unnamed part, inherited flag, or missing graph
 * identity is isolated instead of becoming tutti or reduction authority.
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
    if (!namedRoleOnSection(sectionValue, roleId)) {
      continue;
    }
    nodes.push({ roleId, active });
  }
  return nodes;
}

/**
 * Pick the first full-band hit a player should take after a reduced section.
 *
 * Uses existing `partGraph` `is_active` authority already produced by
 * analysis. A tutti is the first later named section where every named
 * graph node is own-property active after an earlier named section had at
 * least one own-property sit-out. It is not a come-in, tacet, dropout,
 * handoff, Fine, last-line breath, or the song's opening full-band
 * entrance. Inherited `is_active`, missing graph nodes, blank labels,
 * unnamed roles, single-part hits, same-section false-then-true nodes, and
 * malformed roots fail closed. When a role is selected, only a tutti that
 * includes that named part is shown.
 */
export function firstTutti(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstTutti | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  let reducedFrom: string | null = null;

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

    const sittingOut = nodes.some((node) => node.active === false);
    if (sittingOut) {
      if (!reducedFrom) {
        reducedFrom = sectionLabel;
      }
      continue;
    }

    if (!reducedFrom || reducedFrom === sectionLabel) {
      continue;
    }
    if (nodes.length < 2 || nodes.some((node) => node.active !== true)) {
      continue;
    }
    if (activeRole && !nodes.some((node) => node.roleId === activeRole)) {
      continue;
    }

    return { sectionLabel, fromSectionLabel: reducedFrom };
  }

  return null;
}
