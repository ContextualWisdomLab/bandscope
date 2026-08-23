import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_OVERLAP_CHARACTERS = 180;

/** Tonight's first named overlap: the earliest owned clash and the part that carries it. */
export type FirstOverlap = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  atSeconds: number;
  hint: string;
};

/** Format a non-negative overlap time as m:ss for rehearsal copy. */
export function formatOverlapTime(totalSeconds: number): string {
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

/** Return whether a runtime record owns a stable data property rather than inherited/accessor state. */
function hasOwnData(value: object, key: PropertyKey): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
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

/** Bound buyer-visible text by Unicode code points without splitting a surrogate pair. */
function truncateCodePoints(value: string, maximum: number): string {
  let codePoints = 0;
  let endIndex = 0;
  for (const character of value) {
    if (codePoints >= maximum) {
      break;
    }
    endIndex += character.length;
    codePoints += 1;
  }
  return endIndex === value.length ? value : value.slice(0, endIndex);
}

/** Return a bounded owned overlap warning, or null when the field cannot be shown. */
function firstOwnedWarning(role: RehearsalRole): string | null {
  if (!hasOwnData(role, "overlapWarnings") || !isDenseRuntimeArray(role.overlapWarnings)) {
    return null;
  }
  for (const item of role.overlapWarnings) {
    if (typeof item !== "string") {
      continue;
    }
    const hint = item.trim();
    if (hint.length === 0) {
      continue;
    }
    return truncateCodePoints(hint, MAX_OVERLAP_CHARACTERS);
  }
  return null;
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

/** Return whether a section owns a bounded, positive-length integer rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  if (!hasOwnData(section, "timeRange")) {
    return false;
  }
  const timeRange = section.timeRange as Partial<RehearsalSection["timeRange"]> | null;
  if (
    !isRuntimeObject(timeRange) ||
    !hasOwnData(timeRange, "start") ||
    !hasOwnData(timeRange, "end")
  ) {
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

/** Return the first owned clash string on a section, preferring the holding part. */
function ownedOverlapHint(section: RehearsalSection, holdingRole: RehearsalRole | null): string | null {
  if (holdingRole) {
    const fromHolder = firstOwnedWarning(holdingRole);
    if (fromHolder !== null) {
      return fromHolder;
    }
  }
  if (!hasOwnData(section, "roles") || !isDenseRuntimeArray(section.roles)) {
    return null;
  }
  for (const role of section.roles) {
    if (!isRuntimeObject(role)) {
      continue;
    }
    const warning = firstOwnedWarning(role);
    if (warning !== null) {
      return warning;
    }
  }
  return null;
}

/** Resolve an overlap after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstOverlap(song: RehearsalSong): FirstOverlap | null {
  if (
    !isRuntimeObject(song) ||
    !hasOwnData(song, "sections") ||
    !isDenseRuntimeArray(song.sections)
  ) {
    return null;
  }

  const candidates = song.sections
    .filter(
      (section) =>
        isRuntimeObject(section) &&
        hasOwnData(section, "label") &&
        typeof section.label === "string" &&
        section.label.trim().length > 0 &&
        hasOwnData(section, "id") &&
        typeof section.id === "string" &&
        section.id.trim().length > 0 &&
        hasBoundedTimeRange(section) &&
        ownedOverlapHint(section, null) !== null
    )
    .sort((left, right) => {
      if (left.timeRange.start !== right.timeRange.start) {
        return left.timeRange.start - right.timeRange.start;
      }
      return compareStableId(left.id, right.id);
    });

  const section = candidates[0];
  if (!section) {
    return null;
  }

  const holdingRole = pickHighestPriorityRole(
    rankedActiveRoles(section).filter((role) => firstOwnedWarning(role) !== null)
  );
  const hint = ownedOverlapHint(section, holdingRole);
  if (hint === null) {
    return null;
  }

  return {
    section,
    holdingRole,
    atSeconds: section.timeRange.start,
    hint
  };
}

/** Return the first named overlap, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstOverlap(song: RehearsalSong): FirstOverlap | null {
  try {
    return resolveSafeFirstOverlap(song);
  } catch {
    return null;
  }
}
