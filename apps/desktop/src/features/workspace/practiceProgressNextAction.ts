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

      const existingName = namedRoles.get(roleId);
      if (existingName && existingName !== roleName) {
        return null;
      }
      namedRoles.set(roleId, roleName);
    }
  }

  return namedRoles;
}

type RoleProgress = {
  roleId: string;
  roleName: string;
  progress: number;
};

/** Return trustworthy role-wide progress evidence for each named part. */
function roleProgressCatalog(
  songValue: Record<string, unknown>,
  namedRoles: NamedRoleCatalog
): Map<string, RoleProgress> | null {
  if (!Array.isArray(songValue.sections)) {
    return null;
  }

  const catalog = new Map<string, RoleProgress>();
  for (const [roleId, roleName] of namedRoles) {
    let roleProgress: number | undefined;
    let sawRole = false;

    for (const sectionValue of songValue.sections) {
      if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
        return null;
      }
      for (const roleValue of sectionValue.roles) {
        if (!isRuntimeObject(roleValue) || roleValue.id !== roleId) {
          continue;
        }
        sawRole = true;
        const progress = admitPracticeProgress(roleValue);
        if (progress === null) {
          return null;
        }
        if (roleProgress === undefined) {
          roleProgress = progress;
          continue;
        }
        if (roleProgress !== progress) {
          return null;
        }
      }
    }

    if (!sawRole || roleProgress === undefined) {
      return null;
    }
    catalog.set(roleId, { roleId, roleName, progress: roleProgress });
  }

  return catalog;
}

/** Return whether a named part has at least one trustworthy playable range. */
function hasPlayableRange(song: RehearsalSong, roleId: string): boolean {
  return firstRangeSqueeze(song, roleId)?.roleId === roleId;
}

/**
 * Resolve the next concrete rehearsal action from current named-part progress.
 *
 * Action copy only references a playable range when that range is available.
 * Corrupt, ambiguous, inherited, or contradictory project evidence returns
 * `null` instead of manufacturing a rehearsal instruction.
 */
export function practiceProgressNextAction(
  song: unknown,
  activeRole: string | null
): PracticeProgressNextAction | null {
  if (!activeRole || !isRuntimeObject(song)) {
    return null;
  }

  const namedRoles = namedSongRoles(song);
  if (!namedRoles || !namedRoles.has(activeRole)) {
    return null;
  }
  const progressCatalog = roleProgressCatalog(song, namedRoles);
  if (!progressCatalog) {
    return null;
  }

  const selected = progressCatalog.get(activeRole);
  if (!selected) {
    return null;
  }
  if (selected.progress === 0) {
    if (!hasPlayableRange(song as RehearsalSong, activeRole)) {
      return null;
    }
    return {
      kind: "start",
      roleId: selected.roleId,
      roleName: selected.roleName,
      progress: selected.progress
    };
  }
  if (selected.progress < 100) {
    return {
      kind: "continue",
      roleId: selected.roleId,
      roleName: selected.roleName,
      progress: selected.progress
    };
  }

  for (const nextRole of progressCatalog.values()) {
    if (nextRole.roleId === activeRole || nextRole.progress >= 100) {
      continue;
    }
    if (!hasPlayableRange(song as RehearsalSong, nextRole.roleId)) {
      return null;
    }
    return {
      kind: "ready-next",
      roleId: selected.roleId,
      roleName: selected.roleName,
      progress: selected.progress,
      nextRoleId: nextRole.roleId,
      nextRoleName: nextRole.roleName
    };
  }

  return {
    kind: "ready-done",
    roleId: selected.roleId,
    roleName: selected.roleName,
    progress: selected.progress
  };
}
