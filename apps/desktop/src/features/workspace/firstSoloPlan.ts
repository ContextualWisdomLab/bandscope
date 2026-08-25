import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_SOLO_PLAN_CHARACTERS = 180;
const MAX_RUNTIME_GRAPH_PROPERTIES = 100_000;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);

type RankedRoleMetadata = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
}>;

type RuntimeGraphBudget = {
  properties: number;
};

/** Tonight's first solo plan: the earliest labeled section and the part that owns it. */
export type FirstSoloPlan = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  sectionIndex: number;
  holdingRole: RehearsalRole;
  holdingRoleId: string;
  holdingRoleName: string;
  soloPlan: string;
  atSeconds: number;
};

/** Format a non-negative solo-plan time as m:ss for rehearsal copy. */
export function formatSoloPlanTime(totalSeconds: number): string {
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

/**
 * Verify that a structured-data graph contains only own data properties before cloning it.
 *
 * Descriptor inspection avoids executing application getters. The subsequent HTML structured
 * clone probe rejects Proxy exotic objects, so a Proxy cannot manufacture trusted descriptors
 * for buyer-visible rehearsal guidance. The property budget also keeps this untrusted boundary
 * finite before the resolver walks it.
 */
function hasSafeStructuredDataDescriptors(
  value: unknown,
  seen: Set<object>,
  budget: RuntimeGraphBudget
): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined" ||
    typeof value === "bigint"
  ) {
    return true;
  }
  if (typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);

  const keys = Reflect.ownKeys(value);
  budget.properties += keys.length;
  if (budget.properties > MAX_RUNTIME_GRAPH_PROPERTIES) {
    return false;
  }

  for (const key of keys) {
    if (typeof key === "symbol") {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      !hasSafeStructuredDataDescriptors(descriptor.value, seen, budget)
    ) {
      return false;
    }
  }
  return true;
}

/** Fail closed unless the entire runtime graph is descriptor-only and structured-clone compatible. */
function hasSafeStructuredRuntimeGraph(value: unknown): boolean {
  if (typeof structuredClone !== "function") {
    return false;
  }
  try {
    if (!hasSafeStructuredDataDescriptors(value, new Set<object>(), { properties: 0 })) {
      return false;
    }
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
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

/** Snapshot every numeric own data element from a bounded runtime array. */
function ownedDenseRuntimeArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const length = ownDataValue(value, "length");
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 0xffffffff
  ) {
    return null;
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!hasOwnData(value, index)) {
      return null;
    }
    items.push(ownDataValue(value, index));
  }
  return items;
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

/** Return a bounded snapshotted own solo plan, or null when it cannot be shown. */
function ownedSoloPlan(role: unknown): string | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const soloPlan = ownDataValue(role, "soloPlan");
  if (typeof soloPlan !== "string") {
    return null;
  }
  const trimmed = soloPlan.trim();
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
    return null;
  }
  return truncateCodePoints(trimmed, MAX_SOLO_PLAN_CHARACTERS);
}

/** Snapshot trusted role identity, display name, and priority without accessor authority. */
function ownedRankedRoleMetadata(role: unknown): RankedRoleMetadata | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const id = ownDataValue(role, "id");
  const name = ownDataValue(role, "name");
  const rehearsalPriority = ownDataValue(role, "rehearsalPriority");
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    typeof rehearsalPriority !== "string" ||
    !Object.prototype.hasOwnProperty.call(PRIORITY_RANK, rehearsalPriority)
  ) {
    return null;
  }
  return {
    role: role as RehearsalRole,
    id,
    name,
    rehearsalPriority: rehearsalPriority as keyof typeof PRIORITY_RANK
  };
}

/** Snapshot a section's bounded positive-length integer rehearsal window. */
function ownedBoundedTimeRange(
  section: RehearsalSection
): RehearsalSection["timeRange"] | null {
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
function pickHoldingRole(roles: RankedRoleMetadata[]): RankedRoleMetadata | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const priorityDelta =
        PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareStableId(left.id, right.id);
    })[0] ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RankedRoleMetadata[] {
  const roles = ownedDenseRuntimeArray(ownDataValue(section, "roles"));
  const partGraph = ownedDenseRuntimeArray(ownDataValue(section, "partGraph"));
  if (!roles || !partGraph) {
    return [];
  }

  const safeRoleIds = roles.flatMap((role) => {
    if (!isRuntimeObject(role)) {
      return [];
    }
    const id = ownDataValue(role, "id");
    return typeof id === "string" && id.trim().length > 0 ? [id] : [];
  });
  const safeGraphRoleIds = partGraph.flatMap((node) => {
    if (!isRuntimeObject(node)) {
      return [];
    }
    const roleId = ownDataValue(node, "role_id");
    return typeof roleId === "string" && roleId.trim().length > 0 ? [roleId] : [];
  });
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    partGraph.flatMap((node) => {
      if (!isRuntimeObject(node) || ownDataValue(node, "is_active") !== true) {
        return [];
      }
      const roleId = ownDataValue(node, "role_id");
      return typeof roleId === "string" &&
        roleId.trim().length > 0 &&
        !repeatedGraphRoleIds.has(roleId)
        ? [roleId]
        : [];
    })
  );

  return roles.flatMap((role) => {
    const metadata = ownedRankedRoleMetadata(role);
    return metadata !== null &&
      !repeatedRoleIds.has(metadata.id) &&
      activeIds.has(metadata.id)
      ? [metadata]
      : [];
  });
}

/** Resolve a solo plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstSoloPlan(song: RehearsalSong): FirstSoloPlan | null {
  if (!isRuntimeObject(song) || !hasSafeStructuredRuntimeGraph(song)) {
    return null;
  }
  const sections = ownedDenseRuntimeArray(ownDataValue(song, "sections"));
  if (!sections) {
    return null;
  }

  const candidates = sections
    .flatMap((section, sectionIndex) => {
      if (!isRuntimeObject(section)) {
        return [];
      }
      const sectionId = ownDataValue(section, "id");
      const sectionLabel = ownDataValue(section, "label");
      const timeRange = ownedBoundedTimeRange(section as RehearsalSection);
      if (
        typeof sectionId !== "string" ||
        sectionId.trim().length === 0 ||
        typeof sectionLabel !== "string" ||
        !SECTION_FORM_LABEL_SET.has(sectionLabel) ||
        timeRange === null
      ) {
        return [];
      }

      const holdingRole = pickHoldingRole(
        rankedActiveRoles(section as RehearsalSection).filter(
          (metadata) => ownedSoloPlan(metadata.role) !== null
        )
      );
      if (!holdingRole) {
        return [];
      }
      const soloPlan = ownedSoloPlan(holdingRole.role);
      if (!soloPlan) {
        return [];
      }
      return [
        {
          section: section as RehearsalSection,
          sectionId,
          sectionLabel: sectionLabel as RehearsalSection["label"],
          sectionIndex,
          holdingRole: holdingRole.role,
          holdingRoleId: holdingRole.id,
          holdingRoleName: holdingRole.name,
          soloPlan,
          atSeconds: timeRange.start
        }
      ];
    })
    .sort((left, right) => {
      if (left.atSeconds !== right.atSeconds) {
        return left.atSeconds - right.atSeconds;
      }
      return compareStableId(left.sectionId, right.sectionId);
    });

  return candidates[0] ?? null;
}

/** Return the first named solo plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstSoloPlan(song: RehearsalSong): FirstSoloPlan | null {
  try {
    return resolveSafeFirstSoloPlan(song);
  } catch {
    return null;
  }
}
