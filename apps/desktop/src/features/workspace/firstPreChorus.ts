import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first labeled pre-chorus: the earliest lift and the part that carries it. */
export type FirstPreChorus = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  atSeconds: number;
};

/** Format a non-negative pre-chorus time as m:ss for rehearsal copy. */
export function formatPreChorusTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Compare opaque ids by Unicode code units so tie-breaking never depends on host locale. */
function compareStableId(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Return whether an untrusted runtime value can be inspected as an object. */
function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

/** Return whether every numeric index is present in a bounded runtime array. */
function isDenseRuntimeArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const length = Number(value.length);
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!(index in value)) {
      return false;
    }
  }
  return true;
}

/** Return true when the role has safe runtime identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    typeof role.name === "string" &&
    role.name.trim().length > 0 &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Return whether a section has a bounded, positive-length integer rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  const timeRange = section.timeRange as Partial<RehearsalSection["timeRange"]> | null;
  if (timeRange === null || typeof timeRange !== "object") {
    return false;
  }

  const start = timeRange.start ?? -1;
  const end = timeRange.end ?? -1;
  return (
    Number.isInteger(start) &&
    start >= 0 &&
    start <= MAX_SECTION_TIME_SECONDS &&
    Number.isInteger(end) &&
    end > start &&
    end <= MAX_SECTION_TIME_SECONDS
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

/** Prefer the highest-priority ranked role, then a locale-independent stable id order. */
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
      return compareStableId(left.id, right.id);
    })[0] ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RehearsalRole[] {
  if (!isDenseRuntimeArray(section.roles) || !isDenseRuntimeArray(section.partGraph)) {
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

/** Return the first labeled pre-chorus, or null when no safe lift remains. */
export function resolveFirstPreChorus(song: RehearsalSong): FirstPreChorus | null {
  if (!isRuntimeObject(song) || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const preChorusSections = song.sections
    .filter(
      (section) =>
        isRuntimeObject(section) &&
        section.label === "pre-chorus" &&
        typeof section.id === "string" &&
        section.id.trim().length > 0 &&
        hasBoundedTimeRange(section)
    )
    .sort((left, right) => {
      if (left.timeRange.start !== right.timeRange.start) {
        return left.timeRange.start - right.timeRange.start;
      }
      return compareStableId(left.id, right.id);
    });

  const section = preChorusSections[0];
  if (!section) {
    return null;
  }

  return {
    section,
    holdingRole: pickHighestPriorityRole(rankedActiveRoles(section)),
    atSeconds: section.timeRange.start
  };
}
