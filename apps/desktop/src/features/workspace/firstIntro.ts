import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

type RankedRoleCandidate = {
  role: RehearsalRole;
  id: string;
  priority: keyof typeof PRIORITY_RANK;
};

type IntroSectionCandidate = {
  section: RehearsalSection;
  id: string;
  start: number;
};

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

/** Read an own data property without invoking accessors or letting Proxy descriptor traps escape. */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Return whether materialized enumerable keys exactly cover a runtime array's numeric indices. */
function isDenseRuntimeArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  try {
    const length = Number(value.length);
    if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
      return false;
    }
    const keys = Object.keys(value);
    return keys.length === length && keys.every((key, index) => key === String(index));
  } catch {
    return false;
  }
}

/** Snapshot the bounded integer rehearsal window from own data properties only. */
function readBoundedTimeRange(section: object): { start: number; end: number } | null {
  const timeRange = readOwnDataProperty(section, "timeRange");
  if (!isRuntimeObject(timeRange)) {
    return null;
  }

  const start = readOwnDataProperty(timeRange, "start");
  const end = readOwnDataProperty(timeRange, "end");
  if (
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < 0 ||
    start > MAX_SECTION_TIME_SECONDS ||
    typeof end !== "number" ||
    !Number.isInteger(end) ||
    end <= start ||
    end > MAX_SECTION_TIME_SECONDS
  ) {
    return null;
  }
  return { start, end };
}

/** Snapshot the ranking fields needed from one untrusted role without invoking accessors. */
function readRankedRoleCandidate(value: unknown): RankedRoleCandidate | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  const id = readOwnDataProperty(value, "id");
  const name = readOwnDataProperty(value, "name");
  const priority = readOwnDataProperty(value, "rehearsalPriority");
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    typeof priority !== "string" ||
    !Object.prototype.hasOwnProperty.call(PRIORITY_RANK, priority)
  ) {
    return null;
  }
  return {
    role: value as RehearsalRole,
    id,
    priority: priority as keyof typeof PRIORITY_RANK
  };
}

/** Snapshot a valid labeled intro candidate so later sorting cannot invoke untrusted accessors. */
function readIntroSectionCandidate(value: unknown): IntroSectionCandidate | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  const label = readOwnDataProperty(value, "label");
  const id = readOwnDataProperty(value, "id");
  const timeRange = readBoundedTimeRange(value);
  if (label !== "intro" || typeof id !== "string" || id.trim().length === 0 || !timeRange) {
    return null;
  }
  return {
    section: value as RehearsalSection,
    id,
    start: timeRange.start
  };
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
function pickHighestPriorityRole(candidates: RankedRoleCandidate[]): RehearsalRole | null {
  if (candidates.length === 0) {
    return null;
  }
  return (
    [...candidates].sort((left, right) => {
      const rankDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return compareStableId(left.id, right.id);
    })[0]?.role ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RankedRoleCandidate[] {
  const roles = readOwnDataProperty(section, "roles");
  const partGraph = readOwnDataProperty(section, "partGraph");
  if (!isDenseRuntimeArray(roles) || !isDenseRuntimeArray(partGraph)) {
    return [];
  }

  const roleCandidates = roles
    .map(readRankedRoleCandidate)
    .filter((candidate): candidate is RankedRoleCandidate => candidate !== null);
  const repeatedRoleIds = repeatedIds(roleCandidates.map((candidate) => candidate.id));

  const graphCandidates = partGraph.flatMap((node) => {
    if (!isRuntimeObject(node)) {
      return [];
    }
    const roleId = readOwnDataProperty(node, "role_id");
    const isActive = readOwnDataProperty(node, "is_active");
    if (typeof roleId !== "string" || roleId.trim().length === 0) {
      return [];
    }
    return [{ roleId, isActive }];
  });
  const repeatedGraphRoleIds = repeatedIds(graphCandidates.map((candidate) => candidate.roleId));
  const activeIds = new Set(
    graphCandidates
      .filter(
        (candidate) => candidate.isActive === true && !repeatedGraphRoleIds.has(candidate.roleId)
      )
      .map((candidate) => candidate.roleId)
  );

  return roleCandidates.filter(
    (candidate) => !repeatedRoleIds.has(candidate.id) && activeIds.has(candidate.id)
  );
}

/** Locate a resolved intro's section inside the song's own-data sections array, failing closed to -1. */
export function resolveFirstIntroSectionIndex(
  song: RehearsalSong,
  section: RehearsalSection
): number {
  try {
    if (!isRuntimeObject(song)) {
      return -1;
    }
    const sections = readOwnDataProperty(song, "sections");
    if (!isDenseRuntimeArray(sections)) {
      return -1;
    }
    return sections.indexOf(section);
  } catch {
    return -1;
  }
}

/** Return the first labeled intro, or null when no safe start remains. */
export function resolveFirstIntro(song: RehearsalSong): FirstIntro | null {
  try {
    if (!isRuntimeObject(song)) {
      return null;
    }
    const sections = readOwnDataProperty(song, "sections");
    if (!isDenseRuntimeArray(sections)) {
      return null;
    }

    const introSections = sections
      .map(readIntroSectionCandidate)
      .filter((candidate): candidate is IntroSectionCandidate => candidate !== null)
      .sort((left, right) => {
        if (left.start !== right.start) {
          return left.start - right.start;
        }
        return compareStableId(left.id, right.id);
      });

    const candidate = introSections[0];
    if (!candidate) {
      return null;
    }

    return {
      section: candidate.section,
      holdingRole: pickHighestPriorityRole(rankedActiveRoles(candidate.section)),
      atSeconds: candidate.start
    };
  } catch {
    return null;
  }
}
