import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_FUNCTION_LABEL_CHARACTERS = 180;

type RankedRoleMetadata = Readonly<{
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
}>;

/** Tonight's first harmonic function: the earliest labeled section and the part that owns it. */
export type FirstHarmonicFunction = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  holdingRole: RehearsalRole;
  holdingRoleId: string;
  holdingRoleName: string;
  functionLabel: string;
  atSeconds: number;
};

/** Format a non-negative harmonic-function time as m:ss for rehearsal copy. */
export function formatHarmonicFunctionTime(totalSeconds: number): string {
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

/** Snapshot one owned data-property value without invoking a getter or Proxy get trap. */
function ownDataValue(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
}

/** Snapshot every element of a bounded dense runtime array without invoking property getters. */
function snapshotDenseRuntimeArray(value: unknown): unknown[] | null {
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
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      return null;
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
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

/** Return a bounded snapshotted own harmonic function label, or null when it cannot be shown. */
function ownedFunctionLabel(role: unknown): string | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const harmony = ownDataValue(role, "harmony");
  if (!isRuntimeObject(harmony)) {
    return null;
  }
  const functionLabel = ownDataValue(harmony, "functionLabel");
  if (typeof functionLabel !== "string") {
    return null;
  }
  const trimmed = functionLabel.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return truncateCodePoints(trimmed, MAX_FUNCTION_LABEL_CHARACTERS);
}

/** Snapshot trusted role identity, display name, and priority without Proxy get authority. */
function ownedRankedRoleMetadata(role: RehearsalRole): RankedRoleMetadata | null {
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
function pickHoldingRole(roles: RehearsalRole[]): RehearsalRole | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const leftMetadata = ownedRankedRoleMetadata(left);
      const rightMetadata = ownedRankedRoleMetadata(right);
      if (!leftMetadata || !rightMetadata) {
        return leftMetadata ? -1 : rightMetadata ? 1 : 0;
      }
      const priorityDelta =
        PRIORITY_RANK[leftMetadata.rehearsalPriority] -
        PRIORITY_RANK[rightMetadata.rehearsalPriority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareStableId(leftMetadata.id, rightMetadata.id);
    })[0] ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RehearsalRole[] {
  const roles = snapshotDenseRuntimeArray(ownDataValue(section, "roles"));
  const partGraph = snapshotDenseRuntimeArray(ownDataValue(section, "partGraph"));
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

  return roles.filter((role) => {
    if (!isRuntimeObject(role)) {
      return false;
    }
    const metadata = ownedRankedRoleMetadata(role as RehearsalRole);
    return (
      metadata !== null &&
      !repeatedRoleIds.has(metadata.id) &&
      activeIds.has(metadata.id)
    );
  }) as RehearsalRole[];
}

/** Resolve a harmonic function after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstHarmonicFunction(song: RehearsalSong): FirstHarmonicFunction | null {
  if (!isRuntimeObject(song)) {
    return null;
  }
  const sections = snapshotDenseRuntimeArray(ownDataValue(song, "sections"));
  if (!sections) {
    return null;
  }

  const candidates = sections
    .flatMap((section) => {
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
        sectionLabel.trim().length === 0 ||
        timeRange === null
      ) {
        return [];
      }
      const holdingRole = pickHoldingRole(
        rankedActiveRoles(section as RehearsalSection).filter((role) => ownedFunctionLabel(role) !== null)
      );
      if (!holdingRole) {
        return [];
      }
      const holdingRoleMetadata = ownedRankedRoleMetadata(holdingRole);
      const functionLabel = ownedFunctionLabel(holdingRole);
      if (!holdingRoleMetadata || !functionLabel) {
        return [];
      }
      return [
        {
          section: section as RehearsalSection,
          sectionId,
          sectionLabel: sectionLabel as RehearsalSection["label"],
          holdingRole,
          holdingRoleId: holdingRoleMetadata.id,
          holdingRoleName: holdingRoleMetadata.name,
          functionLabel,
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

/** Return the first named harmonic function, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstHarmonicFunction(song: RehearsalSong): FirstHarmonicFunction | null {
  try {
    return resolveSafeFirstHarmonicFunction(song);
  } catch {
    return null;
  }
}
