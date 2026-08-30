import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named part-to-part pass on the rehearsal map. */
export type FirstHandoff = {
  sectionLabel: string;
  fromRole: string;
  toRole: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Admit a named role id and display name from own properties only. */
function namedRole(value: unknown): { id: string; name: string } | null {
  if (
    !isRuntimeObject(value) ||
    !Object.prototype.hasOwnProperty.call(value, "id") ||
    !Object.prototype.hasOwnProperty.call(value, "name")
  ) {
    return null;
  }
  const id = meaningfulRangeText(value.id);
  const name = meaningfulRangeText(value.name);
  if (!id || !name) {
    return null;
  }
  return { id, name };
}

/** Admit an own-property boolean `is_active` flag. Inherited evidence is isolated. */
function isOwnActive(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "is_active") && value.is_active === true;
}

/**
 * Pick the first named part-to-part pass a player should lock before the next section.
 *
 * Uses existing `partGraph.handoff_to` authority already produced by analysis.
 * Inactive, inherited, blank, self, or unknown receivers are skipped. When a
 * role is selected, only a pass that includes that role is named. Runtime
 * roots and collection members are treated as untrusted.
 */
export function firstHandoff(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstHandoff | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  for (const sectionValue of song.sections) {
    if (
      !isRuntimeObject(sectionValue) ||
      !Array.isArray(sectionValue.roles) ||
      !Array.isArray(sectionValue.partGraph)
    ) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    const rolesById = new Map<string, string>();
    for (const roleValue of sectionValue.roles) {
      const role = namedRole(roleValue);
      if (role && !rolesById.has(role.id)) {
        rolesById.set(role.id, role.name);
      }
    }

    for (const nodeValue of sectionValue.partGraph) {
      if (
        !isRuntimeObject(nodeValue) ||
        !Object.prototype.hasOwnProperty.call(nodeValue, "role_id") ||
        !isOwnActive(nodeValue) ||
        !Array.isArray(nodeValue.handoff_to)
      ) {
        continue;
      }
      const fromId = meaningfulRangeText(nodeValue.role_id);
      const fromRole = fromId ? rolesById.get(fromId) : undefined;
      if (!fromId || !fromRole) {
        continue;
      }

      for (const receiverValue of nodeValue.handoff_to) {
        const toId = meaningfulRangeText(receiverValue);
        if (!toId || toId === fromId) {
          continue;
        }
        const toRole = rolesById.get(toId);
        if (!toRole) {
          continue;
        }
        if (activeRole && fromId !== activeRole && toId !== activeRole) {
          continue;
        }
        return { sectionLabel, fromRole, toRole };
      }
    }
  }

  return null;
}
