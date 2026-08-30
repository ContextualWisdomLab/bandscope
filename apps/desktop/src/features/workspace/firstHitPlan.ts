import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  isNonEmptySingleLineText,
  type ProvenanceSource,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_HIT_PLAN_CHARACTERS = 180;
const GENERATED_ACTIVITY_HIT_PLAN_PREFIX = "Land this hit with ";
const GENERATED_ACTIVITY_HIT_PLAN_SUFFIX = "; don't drift past the downbeat.";
const GENERATED_ACTIVITY_HIT_PLAN_FIXED_CHARACTERS = Array.from(
  GENERATED_ACTIVITY_HIT_PLAN_PREFIX + GENERATED_ACTIVITY_HIT_PLAN_SUFFIX
).length;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);

type RankedRoleMetadata = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
}>;

type OwnedHitPlan = Readonly<{
  hitPlan: string;
  hitPlanSource: ProvenanceSource;
}>;

/** Tonight's first hit plan: the earliest labeled section and the part that lands it. */
export type FirstHitPlan = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  sectionIndex: number;
  sectionRoleNames: readonly string[];
  landingRole: RehearsalRole;
  landingRoleId: string;
  landingRoleName: string;
  hitPlan: string;
  hitPlanSource: ProvenanceSource;
  atSeconds: number;
};

/** Format a non-negative hit-plan time as m:ss for rehearsal copy. */
export function formatHitPlanTime(totalSeconds: number): string {
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

/** Bound buyer-visible model text by Unicode code points without splitting a surrogate pair. */
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

/** Keep a bounded engine-owned hit sentence structurally recognizable for localization. */
function boundedGeneratedActivityHitPlan(value: string): string | null {
  if (
    !value.startsWith(GENERATED_ACTIVITY_HIT_PLAN_PREFIX) ||
    !value.endsWith(GENERATED_ACTIVITY_HIT_PLAN_SUFFIX)
  ) {
    return null;
  }
  const target = value
    .slice(
      GENERATED_ACTIVITY_HIT_PLAN_PREFIX.length,
      value.length - GENERATED_ACTIVITY_HIT_PLAN_SUFFIX.length
    )
    .trim();
  if (target.length === 0) {
    return null;
  }
  const boundedTarget = truncateCodePoints(
    target,
    MAX_HIT_PLAN_CHARACTERS - GENERATED_ACTIVITY_HIT_PLAN_FIXED_CHARACTERS
  );
  return `${GENERATED_ACTIVITY_HIT_PLAN_PREFIX}${boundedTarget}${GENERATED_ACTIVITY_HIT_PLAN_SUFFIX}`;
}

/** Return a snapshotted own hit plan and explicit source, or null when it cannot be shown. */
function ownedHitPlan(role: RehearsalRole): OwnedHitPlan | null {
  const hitPlan = ownDataValue(role, "hitPlan");
  if (typeof hitPlan !== "string") {
    return null;
  }
  if (!isNonEmptySingleLineText(hitPlan)) {
    return null;
  }
  const hitPlanSource = ownDataValue(role, "hitPlanSource");
  if (hitPlanSource !== "model" && hitPlanSource !== "user") {
    return null;
  }
  if (hitPlanSource === "user") {
    return { hitPlan: truncateCodePoints(hitPlan, MAX_HIT_PLAN_CHARACTERS), hitPlanSource };
  }
  const trimmed = hitPlan.trim();
  return {
    hitPlan:
      boundedGeneratedActivityHitPlan(trimmed) ??
      truncateCodePoints(trimmed, MAX_HIT_PLAN_CHARACTERS),
    hitPlanSource
  };
}

/** Snapshot trusted role identity, display name, and priority without Proxy get authority. */
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

/** Prefer the higher rehearsal priority, then a locale-independent id. */
function pickLandingRole<T extends RankedRoleMetadata>(roles: T[]): T | null {
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

/** Resolve a hit plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstHitPlan(song: RehearsalSong): FirstHitPlan | null {
  if (!isRuntimeObject(song)) {
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

      const activeRoles = rankedActiveRoles(section as RehearsalSection);
      const plannedRoles = activeRoles.flatMap((metadata) => {
        const hitPlan = ownedHitPlan(metadata.role);
        return hitPlan === null ? [] : [{ ...metadata, ...hitPlan }];
      });
      const landingRole = pickLandingRole(plannedRoles);
      if (!landingRole) {
        return [];
      }
      return [
        {
          section: section as RehearsalSection,
          sectionId,
          sectionLabel: sectionLabel as RehearsalSection["label"],
          sectionIndex,
          sectionRoleNames: activeRoles.map((metadata) => metadata.name),
          landingRole: landingRole.role,
          landingRoleId: landingRole.id,
          landingRoleName: landingRole.name,
          hitPlan: landingRole.hitPlan,
          hitPlanSource: landingRole.hitPlanSource,
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

/** Return the first named hit plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstHitPlan(song: RehearsalSong): FirstHitPlan | null {
  try {
    return resolveSafeFirstHitPlan(song);
  } catch {
    return null;
  }
}
