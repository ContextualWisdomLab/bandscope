import type { RehearsalSong } from "@bandscope/shared-types";
import { firstRangeSqueeze, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's next practice step after a named part is selected. */
export type PracticeProgressNextAction = {
  kind: "start" | "continue" | "ready-next" | "ready-done";
  roleId: string;
  roleName: string;
  progress: number;
  nextRoleId?: string;
  nextRoleName?: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit an own-property practice-progress percentage.
 *
 * Missing or explicitly undefined optional progress means the part has not
 * been marked started. Inherited, non-finite, or out-of-range values fail
 * closed so a prototype member or corrupt project field cannot become
 * rehearsal authority.
 */
export function admitPracticeProgress(roleValue: Record<string, unknown>): number | null {
  if (!Object.prototype.hasOwnProperty.call(roleValue, "practiceProgress")) {
    try {
      return "practiceProgress" in roleValue ? null : 0;
    } catch {
      return null;
    }
  }
  if (roleValue.practiceProgress === undefined) {
    return 0;
  }
  const value = roleValue.practiceProgress;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    return null;
  }
  return value;
}

type NamedRoleCatalog = Map<string, string>;

/**
 * Build trustworthy role identity evidence across the whole song.
 *
 * Duplicate ids, blank names, or the same id with two display names fail
 * closed so a practice handoff cannot name the wrong part.
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

/**
 * Return one consistent progress value for a named part, or fail closed.
 *
 * Workspace writes the same percentage onto every section copy of a role.
 * Conflicting copies are not rehearsal authority.
 */
function consistentRoleProgress(
  songValue: Record<string, unknown>,
  roleId: string
): number | null {
  if (!Array.isArray(songValue.sections)) {
    return null;
  }

  let admitted: number | null = null;
  let seen = false;

  for (const sectionValue of songValue.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      return null;
    }
    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue) || !Object.prototype.hasOwnProperty.call(roleValue, "id")) {
        return null;
      }
      if (meaningfulRangeText(roleValue.id) !== roleId) {
        continue;
      }
      const progress = admitPracticeProgress(roleValue);
      if (progress === null) {
        return null;
      }
      if (!seen) {
        admitted = progress;
        seen = true;
        continue;
      }
      if (admitted !== progress) {
        return null;
      }
    }
  }

  return seen ? admitted : 0;
}

/** Return whether a named part has at least one admitted playable range. */
function hasPlayableRange(song: RehearsalSong, roleId: string): boolean {
  return firstRangeSqueeze(song, roleId) !== null;
}

/**
 * Pick tonight's next practice step after a named part is selected.
 *
 * A part that has not been marked started is told to check its first range
 * only when a playable range is actually admitted. A part still below 100%
 * is told to keep practicing until it is ready for the room. A part marked
 * ready names the next named part that is not ready only when that part also
 * has a playable range. When every named part is ready, the next action is to
 * download tonight's cue sheet and send it to the group. This is not a
 * leftover, come-in, tacet, or MIR product.
 *
 * Inherited or out-of-range progress, unnamed roles, conflicting section
 * copies, malformed roots, and actions that depend on unavailable ranges fail
 * closed instead of presenting an impossible rehearsal instruction.
 */
export function practiceProgressNextAction(
  song: RehearsalSong | unknown,
  activeRole: string | null
): PracticeProgressNextAction | null {
  if (!activeRole || !isRuntimeObject(song)) {
    return null;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles || !namedRoles.has(activeRole)) {
    return null;
  }

  const progress = consistentRoleProgress(song, activeRole);
  if (progress === null) {
    return null;
  }

  const roleName = namedRoles.get(activeRole);
  if (!roleName) {
    return null;
  }

  if (progress < 100) {
    if (progress <= 0 && !hasPlayableRange(song as RehearsalSong, activeRole)) {
      return null;
    }
    return {
      kind: progress <= 0 ? "start" : "continue",
      roleId: activeRole,
      roleName,
      progress
    };
  }

  for (const [roleId, nextRoleName] of namedRoles) {
    if (roleId === activeRole) {
      continue;
    }
    const nextProgress = consistentRoleProgress(song, roleId);
    if (nextProgress === null) {
      return null;
    }
    if (nextProgress < 100) {
      if (!hasPlayableRange(song as RehearsalSong, roleId)) {
        return null;
      }
      return {
        kind: "ready-next",
        roleId: activeRole,
        roleName,
        progress,
        nextRoleId: roleId,
        nextRoleName
      };
    }
  }

  return {
    kind: "ready-done",
    roleId: activeRole,
    roleName,
    progress
  };
}
