import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_HARMONIC_EXPLANATION_CHARACTERS = 180;

/** Tonight's first harmonic explanation: the earliest labeled section and the part that owns it. */
export type FirstHarmonicExplanation = {
  section: RehearsalSection;
  holdingRole: RehearsalRole;
  explanation: string;
  atSeconds: number;
};

type BoundedTimeRange = {
  start: number;
  end: number;
};

/** Format a non-negative harmonic-explanation time as m:ss for rehearsal copy. */
export function formatHarmonicExplanationTime(totalSeconds: number): string {
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

/** Snapshot one owned data-property value without invoking a getter or Proxy get trap. */
function ownDataValue(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
}

/** Return whether a runtime section owns a label from the shared canonical form vocabulary. */
function hasKnownSectionLabel(section: RehearsalSection): boolean {
  return (
    hasOwnData(section, "label") &&
    typeof section.label === "string" &&
    (SECTION_FORM_LABELS as readonly string[]).includes(section.label)
  );
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

/** Return a bounded snapshotted own harmonic explanation, or null when it cannot be shown. */
function ownedHarmonicExplanation(role: unknown): string | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const explanation = ownDataValue(role, "harmonicExplanation");
  if (typeof explanation !== "string") {
    return null;
  }
  const trimmed = explanation.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return truncateCodePoints(trimmed, MAX_HARMONIC_EXPLANATION_CHARACTERS);
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

/** Snapshot a bounded positive-length integer rehearsal window from owned data properties. */
function ownedBoundedTimeRange(section: RehearsalSection): BoundedTimeRange | null {
  const timeRange = ownDataValue(section, "timeRange");
  if (!isRuntimeObject(timeRange)) {
    return null;
  }

  const start = ownDataValue(timeRange, "start");
  const end = ownDataValue(timeRange, "end");
  if (typeof start !== "number" || typeof end !== "number") {
    return null;
  }
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    start > MAX_SECTION_TIME_SECONDS ||
    !Number.isInteger(end) ||
    end <= start ||
    end > MAX_SECTION_TIME_SECONDS
  ) {
    return null;
  }
  return { start, end };
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

/** Prefer the earlier ranked role, then rehearsal priority, then a locale-independent id. */
function pickHoldingRole(roles: RehearsalRole[]): RehearsalRole | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
      if (priorityDelta !== 0) {
        return priorityDelta;
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

/** Resolve a harmonic explanation after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstHarmonicExplanation(song: RehearsalSong): FirstHarmonicExplanation | null {
  if (!isRuntimeObject(song) || !hasOwnData(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const candidates = song.sections
    .flatMap((section) => {
      if (
        !isRuntimeObject(section) ||
        !hasKnownSectionLabel(section) ||
        !hasOwnData(section, "id") ||
        typeof section.id !== "string" ||
        section.id.trim().length === 0
      ) {
        return [];
      }
      const timeRange = ownedBoundedTimeRange(section);
      if (!timeRange) {
        return [];
      }
      const holdingRole = pickHoldingRole(
        rankedActiveRoles(section).filter((role) => ownedHarmonicExplanation(role) !== null)
      );
      if (!holdingRole) {
        return [];
      }
      const explanation = ownedHarmonicExplanation(holdingRole);
      if (!explanation) {
        return [];
      }
      return [
        {
          section,
          holdingRole,
          explanation,
          atSeconds: timeRange.start
        }
      ];
    })
    .sort((left, right) => {
      if (left.atSeconds !== right.atSeconds) {
        return left.atSeconds - right.atSeconds;
      }
      return compareStableId(left.section.id, right.section.id);
    });

  return candidates[0] ?? null;
}

/** Return the first named harmonic explanation, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstHarmonicExplanation(song: RehearsalSong): FirstHarmonicExplanation | null {
  try {
    return resolveSafeFirstHarmonicExplanation(song);
  } catch {
    return null;
  }
}
