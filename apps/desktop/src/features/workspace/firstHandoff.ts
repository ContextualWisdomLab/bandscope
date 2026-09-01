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

/** Build a named-role lookup from an untrusted section role collection. */
function namedRolesById(values: unknown[]): Map<string, string> {
  const rolesById = new Map<string, string>();
  for (const roleValue of values) {
    const role = namedRole(roleValue);
    if (role && !rolesById.has(role.id)) {
      rolesById.set(role.id, role.name);
    }
  }
  return rolesById;
}

/** Admit an own-property boolean `is_active` flag. Inherited evidence is isolated. */
function isOwnActive(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "is_active") && value.is_active === true;
}

/**
 * Pick the first named part-to-part pass a player should lock before the next section.
 *
 * Analysis stores a transition on the source section's `partGraph.handoff_to`,
 * while the rehearsal cue belongs to the immediately following section. The
 * source section names the active giver; the destination section names a role
 * that becomes active there. Inactive, inherited, blank, self, or unknown
 * receivers are skipped. When a role is selected, only a pass that includes
 * that role is named. Runtime roots and collection members are untrusted.
 */
export function firstHandoff(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstHandoff | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  for (let sectionIndex = 0; sectionIndex < song.sections.length - 1; sectionIndex += 1) {
    const sectionValue = song.sections[sectionIndex];
    const destinationValue = song.sections[sectionIndex + 1];
    if (
      !isRuntimeObject(sectionValue) ||
      !Array.isArray(sectionValue.roles) ||
      !Array.isArray(sectionValue.partGraph) ||
      !isRuntimeObject(destinationValue) ||
      !Array.isArray(destinationValue.roles)
    ) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(destinationValue.label);
    if (!sectionLabel) {
      continue;
    }

    const sourceRolesById = namedRolesById(sectionValue.roles);
    const destinationRolesById = namedRolesById(destinationValue.roles);

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
      const fromRole = fromId ? sourceRolesById.get(fromId) : undefined;
      if (!fromId || !fromRole) {
        continue;
      }

      for (const receiverValue of nodeValue.handoff_to) {
        const toId = meaningfulRangeText(receiverValue);
        if (!toId || toId === fromId) {
          continue;
        }
        const toRole = destinationRolesById.get(toId);
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
