import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_TRANSITION_CUE_CODE_POINTS = 180;

type BoundedTimeRange = Readonly<{
  start: number;
  end: number;
}>;

/** Tonight's first owned transition cue: the earliest change and the part that holds it. */
export type FirstTransition = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: string;
  holdingRole: RehearsalRole | null;
  atSeconds: number;
  cue: string;
};

/** Format a non-negative transition time as m:ss for rehearsal copy. */
export function formatTransitionTime(totalSeconds: number): string {
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

/** Return an owned data-property value without invoking a getter or ordinary property read. */
function ownDataValue(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
}

/** Return whether a runtime record owns a stable data property rather than inherited/accessor state. */
function hasOwnData(value: object, key: PropertyKey): boolean {
  return ownDataValue(value, key) !== undefined;
}

/** Return whether every numeric index is an own data element in a bounded runtime array. */
function isDenseRuntimeArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const length = Number(value.length);
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!hasOwnData(value, index)) {
      return false;
    }
  }
  return true;
}

/** Return true when the role has safe owned identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    hasOwnData(role, "id") &&
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    hasOwnData(role, "name") &&
    typeof role.name === "string" &&
    role.name.trim().length > 0 &&
    hasOwnData(role, "rehearsalPriority") &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Snapshot a bounded, positive-length integer rehearsal window from owned data properties. */
function boundedTimeRange(section: RehearsalSection): BoundedTimeRange | null {
  const timeRange = ownDataValue(section, "timeRange");
  if (!isRuntimeObject(timeRange)) {
    return null;
  }

  const start = ownDataValue(timeRange, "start");
  const end = ownDataValue(timeRange, "end");
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

/** Return the owned transition cue text, or null when lyric/count/empty/overlong values cannot be trusted. */
function ownedTransitionCue(role: RehearsalRole): string | null {
  if (!hasOwnData(role, "cue")) {
    return null;
  }
  const cue = role.cue as Partial<RehearsalRole["cue"]> | null;
  if (
    !isRuntimeObject(cue) ||
    !hasOwnData(cue, "kind") ||
    cue.kind !== "transition" ||
    !hasOwnData(cue, "value") ||
    typeof cue.value !== "string"
  ) {
    return null;
  }
  const value = cue.value.trim();
  if (value.length === 0 || [...value].length > MAX_TRANSITION_CUE_CODE_POINTS) {
    return null;
  }
  return value;
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
    !hasOwnData(section, "roles") ||
    !hasOwnData(section, "partGraph") ||
    !isDenseRuntimeArray(section.roles) ||
    !isDenseRuntimeArray(section.partGraph)
  ) {
    return [];
  }

  const safeRoleIds = section.roles
    .filter(
      (role) =>
        isRuntimeObject(role) &&
        hasOwnData(role, "id") &&
        typeof role.id === "string" &&
        role.id.trim().length > 0
    )
    .map((role) => role.id);
  const safeGraphRoleIds = section.partGraph
    .filter(
      (node) =>
        isRuntimeObject(node) &&
        hasOwnData(node, "role_id") &&
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
          hasOwnData(node, "is_active") &&
          node.is_active === true &&
          hasOwnData(node, "role_id") &&
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

/** Collect owned transition-bearing roles in a section, regardless of graph activity. */
function transitionRoles(section: RehearsalSection): RehearsalRole[] {
  if (!hasOwnData(section, "roles") || !isDenseRuntimeArray(section.roles)) {
    return [];
  }
  return section.roles.filter(
    (role) => isRuntimeObject(role) && ownedTransitionCue(role) !== null
  );
}

/** Resolve a transition after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstTransition(song: RehearsalSong): FirstTransition | null {
  if (
    !isRuntimeObject(song) ||
    !hasOwnData(song, "sections") ||
    !isDenseRuntimeArray(song.sections)
  ) {
    return null;
  }

  const transitionSections: Array<{
    section: RehearsalSection;
    sectionId: string;
    sectionLabel: string;
    timeRange: BoundedTimeRange;
  }> = [];
  for (const section of song.sections) {
    if (!isRuntimeObject(section)) {
      continue;
    }
    const sectionId = ownDataValue(section, "id");
    const sectionLabel = ownDataValue(section, "label");
    if (
      typeof sectionId !== "string" ||
      sectionId.trim().length === 0 ||
      typeof sectionLabel !== "string" ||
      sectionLabel.trim().length === 0
    ) {
      continue;
    }
    const timeRange = boundedTimeRange(section);
    if (timeRange === null || transitionRoles(section).length === 0) {
      continue;
    }
    transitionSections.push({ section, sectionId, sectionLabel, timeRange });
  }
  transitionSections.sort((left, right) => {
    if (left.timeRange.start !== right.timeRange.start) {
      return left.timeRange.start - right.timeRange.start;
    }
    return compareStableId(left.sectionId, right.sectionId);
  });

  const candidate = transitionSections[0];
  if (!candidate) {
    return null;
  }
  const section = candidate.section;

  const holdingRole = pickHighestPriorityRole(
    rankedActiveRoles(section).filter((role) => ownedTransitionCue(role) !== null)
  );
  const cueRole =
    holdingRole ??
    [...transitionRoles(section)].sort((left, right) => compareStableId(left.id, right.id))[0];
  const cue = cueRole ? ownedTransitionCue(cueRole) : null;
  if (cue === null) {
    return null;
  }

  return {
    section,
    sectionId: candidate.sectionId,
    sectionLabel: candidate.sectionLabel,
    holdingRole,
    atSeconds: candidate.timeRange.start,
    cue
  };
}

/** Return the first owned transition cue, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstTransition(song: RehearsalSong): FirstTransition | null {
  try {
    return resolveSafeFirstTransition(song);
  } catch {
    return null;
  }
}
