import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalAssignment,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const ACTIONABLE_STATUS_RANK = { blocked: 0 } as const;
const MAX_ASSIGNMENT_SUMMARY_CHARACTERS = 180;

/** Tonight's first blocked job: the earliest owned stuck assignment and the part that carries it. */
export type FirstBlockedAssignment = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  assignment: RehearsalAssignment;
  atSeconds: number;
  hint: string;
};

/** Format a non-negative blocked-job time as m:ss for rehearsal copy. */
export function formatBlockedTime(totalSeconds: number): string {
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

/** Return a bounded owned assignment summary, or null when the field cannot be shown. */
function ownedAssignmentHint(assignment: RehearsalAssignment): string | null {
  if (!hasOwnData(assignment, "summary") || typeof assignment.summary !== "string") {
    return null;
  }
  const hint = assignment.summary.trim();
  if (hint.length === 0) {
    return null;
  }
  return truncateCodePoints(hint, MAX_ASSIGNMENT_SUMMARY_CHARACTERS);
}

/** Return true when the assignment owns identity, assignee, blocked status, and a section pointer. */
function isBlockedAssignment(assignment: RehearsalAssignment): boolean {
  return (
    isRuntimeObject(assignment) &&
    hasOwnData(assignment, "id") &&
    typeof assignment.id === "string" &&
    assignment.id.trim().length > 0 &&
    hasOwnData(assignment, "assignee") &&
    typeof assignment.assignee === "string" &&
    assignment.assignee.trim().length > 0 &&
    hasOwnData(assignment, "sectionId") &&
    typeof assignment.sectionId === "string" &&
    assignment.sectionId.trim().length > 0 &&
    hasOwnData(assignment, "status") &&
    Object.prototype.hasOwnProperty.call(ACTIONABLE_STATUS_RANK, assignment.status) &&
    ownedAssignmentHint(assignment) !== null
  );
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
  if (!isRuntimeObject(timeRange) || !hasOwnData(timeRange, "start") || !hasOwnData(timeRange, "end")) {
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

/** Return safe identities that appear more than once in one collection. */
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

/** Map unique owned ids onto their records; duplicated ids are not authority. */
function uniqueOwnedById<T extends object>(
  items: T[],
  readId: (item: T) => string | null
): Map<string, T> {
  const unique = new Map<string, T>();
  const repeated = new Set<string>();
  for (const item of items) {
    if (!isRuntimeObject(item)) {
      continue;
    }
    const id = readId(item);
    if (id === null || repeated.has(id)) {
      continue;
    }
    if (unique.has(id)) {
      unique.delete(id);
      repeated.add(id);
      continue;
    }
    unique.set(id, item);
  }
  return unique;
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

/** Return the corroborated holding part, or null when the blocked job is band-wide. */
function resolveHoldingRole(
  section: RehearsalSection,
  assignment: RehearsalAssignment
): RehearsalRole | null {
  if (!hasOwnData(assignment, "roleId") || typeof assignment.roleId !== "string") {
    return null;
  }
  const roleId = assignment.roleId.trim();
  if (roleId.length === 0) {
    return null;
  }
  return rankedActiveRoles(section).find((role) => role.id === roleId) ?? null;
}

/** Return owned sections that can host a blocked assignment. */
function uniqueReadySections(song: RehearsalSong): Map<string, RehearsalSection> {
  if (!isRuntimeObject(song) || !hasOwnData(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return new Map();
  }

  return uniqueOwnedById(
    song.sections.filter(
      (section) =>
        isRuntimeObject(section) &&
        hasOwnData(section, "label") &&
        typeof section.label === "string" &&
        section.label.trim().length > 0 &&
        hasOwnData(section, "id") &&
        typeof section.id === "string" &&
        section.id.trim().length > 0 &&
        hasBoundedTimeRange(section)
    ),
    (section) => (hasOwnData(section, "id") && typeof section.id === "string" ? section.id : null)
  );
}

/** Resolve a blocked assignment after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstBlockedAssignment(song: RehearsalSong): FirstBlockedAssignment | null {
  if (
    !isRuntimeObject(song) ||
    !hasOwnData(song, "collaboration") ||
    !isRuntimeObject(song.collaboration) ||
    !hasOwnData(song.collaboration, "assignments") ||
    !isDenseRuntimeArray(song.collaboration.assignments)
  ) {
    return null;
  }

  const sections = uniqueReadySections(song);
  if (sections.size === 0) {
    return null;
  }

  const uniqueAssignments = uniqueOwnedById(
    song.collaboration.assignments.filter((assignment) => isBlockedAssignment(assignment)),
    (assignment) =>
      hasOwnData(assignment, "id") && typeof assignment.id === "string" ? assignment.id : null
  );

  const candidates = [...uniqueAssignments.values()]
    .flatMap((assignment) => {
      const section = sections.get(assignment.sectionId);
      const hint = ownedAssignmentHint(assignment);
      if (!section || hint === null) {
        return [];
      }
      return [
        {
          section,
          holdingRole: resolveHoldingRole(section, assignment),
          assignment,
          atSeconds: section.timeRange.start,
          hint
        }
      ];
    })
    .sort((left, right) => {
      if (left.atSeconds !== right.atSeconds) {
        return left.atSeconds - right.atSeconds;
      }
      return compareStableId(left.assignment.id, right.assignment.id);
    });

  return candidates[0] ?? null;
}

/** Return the first blocked job, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstBlockedAssignment(song: RehearsalSong): FirstBlockedAssignment | null {
  try {
    return resolveSafeFirstBlockedAssignment(song);
  } catch {
    return null;
  }
}
