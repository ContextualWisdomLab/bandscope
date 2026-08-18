import type { RehearsalRole, RehearsalSection, RehearsalSong } from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first stop: the earliest labeled cut and the part that holds it. */
export type FirstStopHandoff = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  atSeconds: number;
};

/** Format a non-negative stop time as m:ss for rehearsal copy. */
export function formatStopTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Return whether an untrusted runtime value can be inspected as an object. */
function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

/** Return true when the role has a safe runtime identity and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Return whether a section has a bounded, non-negative rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  const timeRange = section.timeRange as Partial<RehearsalSection["timeRange"]> | null;
  return (
    timeRange !== null &&
    typeof timeRange === "object" &&
    Number.isFinite(timeRange.start) &&
    (timeRange.start ?? -1) >= 0 &&
    Number.isFinite(timeRange.end) &&
    (timeRange.end ?? -1) >= (timeRange.start ?? 0)
  );
}

/** Return safe identities that appear more than once in one section-local collection. */
function repeatedIds(ids: string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      repeated.add(id);
    } else {
      seen.add(id);
    }
  }
  return repeated;
}

/** Prefer the highest-priority ranked role, then a stable id order. */
function pickHighestPriorityRole(roles: RehearsalRole[]): RehearsalRole | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const rankDelta = PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return left.id.localeCompare(right.id);
    })[0] ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RehearsalRole[] {
  if (!Array.isArray(section.roles) || !Array.isArray(section.partGraph)) {
    return [];
  }

  const safeRoleIds = section.roles
    .filter(
      (role) => isRuntimeObject(role) && typeof role.id === "string" && role.id.trim().length > 0
    )
    .map((role) => role.id);
  const safeGraphRoleIds = section.partGraph
    .filter(
      (node) => isRuntimeObject(node) && typeof node.role_id === "string" && node.role_id.trim().length > 0
    )
    .map((node) => node.role_id);
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    section.partGraph
      .filter(
        (node) =>
          isRuntimeObject(node) &&
          node.is_active === true &&
          typeof node.role_id === "string" &&
          node.role_id.trim().length > 0 &&
          !repeatedGraphRoleIds.has(node.role_id)
      )
      .map((node) => node.role_id)
  );

  return section.roles.filter(
    (role) =>
      isRuntimeObject(role) &&
      hasRankedPriority(role) &&
      !repeatedRoleIds.has(role.id) &&
      activeIds.has(role.id)
  );
}

/** Return the first labeled stop, or null when no safe cut remains. */
export function resolveFirstStopHandoff(song: RehearsalSong): FirstStopHandoff | null {
  if (!Array.isArray(song.sections)) {
    return null;
  }

  const stopSections = song.sections
    .filter(
      (section) =>
        isRuntimeObject(section) &&
        section.label === "stop" &&
        typeof section.id === "string" &&
        section.id.trim().length > 0 &&
        hasBoundedTimeRange(section)
    )
    .sort((left, right) => {
      if (left.timeRange.start !== right.timeRange.start) {
        return left.timeRange.start - right.timeRange.start;
      }
      return left.id.localeCompare(right.id);
    });

  const section = stopSections[0];
  if (!section) {
    return null;
  }

  return {
    section,
    holdingRole: pickHighestPriorityRole(rankedActiveRoles(section)),
    atSeconds: section.timeRange.start
  };
}
