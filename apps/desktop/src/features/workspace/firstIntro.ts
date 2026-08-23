import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first labeled intro: the earliest start and the part that counts it in. */
export type FirstIntro = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  atSeconds: number;
};

/** Format a non-negative intro time as m:ss for rehearsal copy. */
export function formatIntroTime(totalSeconds: number): string {
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

/** Return whether an untrusted runtime value can be inspected as a record. */
function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Return whether a runtime record owns the named field without letting Proxy traps escape. */
function hasOwn(value: object, key: PropertyKey): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    return false;
  }
}

/** Read an own data property without invoking accessors or letting Proxy descriptor traps escape. */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Return whether every numeric index is an own element in a bounded runtime array. */
function isDenseRuntimeArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const length = Number(value.length);
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!hasOwn(value, index)) {
      return false;
    }
  }
  return true;
}

/** Return true when the role has safe owned identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    hasOwn(role, "id") &&
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    hasOwn(role, "name") &&
    typeof role.name === "string" &&
    role.name.trim().length > 0 &&
    hasOwn(role, "rehearsalPriority") &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Return whether a section owns a bounded, positive-length integer rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  const timeRange = readOwnDataProperty(section, "timeRange");
  if (!isRuntimeObject(timeRange)) {
    return false;
  }

  const start = readOwnDataProperty(timeRange, "start");
  const end = readOwnDataProperty(timeRange, "end");
  return (
    typeof start === "number" &&
    Number.isInteger(start) &&
    start >= 0 &&
    start <= MAX_SECTION_TIME_SECONDS &&
    typeof end === "number" &&
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
  if (
    !hasOwn(section, "roles") ||
    !hasOwn(section, "partGraph") ||
    !isDenseRuntimeArray(section.roles) ||
    !isDenseRuntimeArray(section.partGraph)
  ) {
    return [];
  }

  const safeRoleIds = section.roles
    .filter(
      (role) =>
        isRuntimeObject(role) &&
        hasOwn(role, "id") &&
        typeof role.id === "string" &&
        role.id.trim().length > 0
    )
    .map((role) => role.id);
  const safeGraphRoleIds = section.partGraph
    .filter(
      (node) =>
        isRuntimeObject(node) &&
        hasOwn(node, "role_id") &&
        typeof node.role_id === "string" &&
        node.role_id.trim().length > 0
    )
    .map((node) => node.role_id);
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    section.partGraph
      .filter(
        (node) =>
          isRuntimeObject(node) &&
          hasOwn(node, "is_active") &&
          node.is_active === true &&
          hasOwn(node, "role_id") &&
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

/** Return the first labeled intro, or null when no safe start remains. */
export function resolveFirstIntro(song: RehearsalSong): FirstIntro | null {
  try {
    if (!isRuntimeObject(song) || !hasOwn(song, "sections") || !isDenseRuntimeArray(song.sections)) {
      return null;
    }

    const introSections = song.sections
      .filter(
        (section) =>
          isRuntimeObject(section) &&
          hasOwn(section, "label") &&
          section.label === "intro" &&
          hasOwn(section, "id") &&
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

    const section = introSections[0];
    if (!section) {
      return null;
    }

    return {
      section,
      holdingRole: pickHighestPriorityRole(rankedActiveRoles(section)),
      atSeconds: section.timeRange.start
    };
  } catch {
    return null;
  }
}
