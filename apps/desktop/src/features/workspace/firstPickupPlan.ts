import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_PICKUP_PLAN_CHARACTERS = 180;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);
const ACCOMPANIMENT_SOURCE_ROLE_IDS = new Set([
  "keys-left",
  "keys-right",
  "acoustic-guitar"
]);
const ACCOMPANIMENT_SOURCE_ID = "other";
const PICKUP_PLAN_PREFIX = "Play this pickup with ";
const PICKUP_PLAN_SUFFIX = "; land the downbeat together.";
const PICKUP_PLAN_BAND_TARGET = "the rest of the band";

type PickupPlanSource = "model" | "user";

/** Structured localization guidance for model-generated pickup-plan copy. */
export type PickupPlanGuidance =
  | Readonly<{ kind: "role"; targetRoleName: string }>
  | Readonly<{ kind: "band" }>;

type RankedRoleMetadata = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
}>;

type OwnedPickupPlan = Readonly<{
  text: string;
  source: PickupPlanSource | null;
  guidance: PickupPlanGuidance | null;
}>;

/** Tonight's first pickup plan: the earliest labeled downbeat a resting part leads into. */
export type FirstPickupPlan = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  sectionIndex: number;
  landingRole: RehearsalRole;
  landingRoleId: string;
  landingRoleName: string;
  pickupPlan: string;
  pickupPlanSource: PickupPlanSource | null;
  pickupPlanGuidance: PickupPlanGuidance | null;
  atSeconds: number;
};

/** Format a non-negative pickup-plan time as m:ss for rehearsal copy. */
export function formatPickupPlanTime(totalSeconds: number): string {
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

/** Preserve the engine pickup template while bounding its model-owned target and localization guidance. */
function boundedGeneratedPickupPlan(value: string): OwnedPickupPlan | null {
  if (!value.startsWith(PICKUP_PLAN_PREFIX) || !value.endsWith(PICKUP_PLAN_SUFFIX)) {
    return null;
  }
  const target = value.slice(PICKUP_PLAN_PREFIX.length, -PICKUP_PLAN_SUFFIX.length);
  if (target.trim().length === 0) {
    return null;
  }
  const fixedLength = Array.from(PICKUP_PLAN_PREFIX + PICKUP_PLAN_SUFFIX).length;
  const boundedTarget = truncateCodePoints(target, MAX_PICKUP_PLAN_CHARACTERS - fixedLength);
  return {
    text: `${PICKUP_PLAN_PREFIX}${boundedTarget}${PICKUP_PLAN_SUFFIX}`,
    source: "model",
    guidance:
      target === PICKUP_PLAN_BAND_TARGET
        ? { kind: "band" }
        : { kind: "role", targetRoleName: boundedTarget }
  };
}

/** Return a bounded snapshotted own pickup plan and its explicit provenance, or null when malformed. */
function ownedPickupPlan(role: unknown): OwnedPickupPlan | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const pickupPlan = ownDataValue(role, "pickupPlan");
  const pickupPlanSource = ownDataValue(role, "pickupPlanSource");
  if (typeof pickupPlan !== "string") {
    return null;
  }
  if (
    pickupPlanSource !== undefined &&
    pickupPlanSource !== "model" &&
    pickupPlanSource !== "user"
  ) {
    return null;
  }
  const trimmed = pickupPlan.trim();
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
    return null;
  }
  if (pickupPlanSource === "model") {
    const generatedPlan = boundedGeneratedPickupPlan(trimmed);
    if (generatedPlan !== null) {
      return generatedPlan;
    }
  }
  return {
    text: truncateCodePoints(trimmed, MAX_PICKUP_PLAN_CHARACTERS),
    source: pickupPlanSource ?? null,
    guidance: null
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

/** Map canonical accompaniment roles back to their shared source-separation stem. */
function pickupSourceId(roleId: string): string {
  return ACCOMPANIMENT_SOURCE_ROLE_IDS.has(roleId) ? ACCOMPANIMENT_SOURCE_ID : roleId;
}

/** Prefer rehearsal priority, then a locale-independent stable id. */
function pickLandingRole<Role extends RankedRoleMetadata>(roles: Role[]): Role | null {
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

/** Return unique graph role ids whose node is explicitly inactive. */
function rankedInactiveRoleIds(section: RehearsalSection): Set<string> {
  const partGraph = ownedDenseRuntimeArray(ownDataValue(section, "partGraph"));
  if (!partGraph) {
    return new Set();
  }
  const safeGraphRoleIds = partGraph.flatMap((node) => {
    if (!isRuntimeObject(node)) {
      return [];
    }
    const roleId = ownDataValue(node, "role_id");
    return typeof roleId === "string" && roleId.trim().length > 0 ? [roleId] : [];
  });
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  return new Set(
    partGraph.flatMap((node) => {
      if (!isRuntimeObject(node) || ownDataValue(node, "is_active") !== false) {
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
}

/** Resolve a pickup plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstPickupPlan(song: RehearsalSong): FirstPickupPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }
  const sections = ownedDenseRuntimeArray(ownDataValue(song, "sections"));
  if (!sections) {
    return null;
  }

  const candidates = sections
    .flatMap((section, sectionIndex) => {
      if (!isRuntimeObject(section) || sectionIndex === 0) {
        return [];
      }
      const previousSection = sections[sectionIndex - 1];
      if (!isRuntimeObject(previousSection)) {
        return [];
      }
      const sectionId = ownDataValue(section, "id");
      const sectionLabel = ownDataValue(section, "label");
      const timeRange = ownedBoundedTimeRange(section as RehearsalSection);
      const previousTimeRange = ownedBoundedTimeRange(previousSection as RehearsalSection);
      if (
        typeof sectionId !== "string" ||
        sectionId.trim().length === 0 ||
        typeof sectionLabel !== "string" ||
        !SECTION_FORM_LABEL_SET.has(sectionLabel) ||
        timeRange === null ||
        previousTimeRange === null ||
        previousTimeRange.end !== timeRange.start
      ) {
        return [];
      }

      const activeRoles = rankedActiveRoles(section as RehearsalSection);
      const previousInactiveIds = rankedInactiveRoleIds(previousSection as RehearsalSection);
      const landingSourceCount = new Set(activeRoles.map((metadata) => pickupSourceId(metadata.id)))
        .size;
      if (landingSourceCount < 2) {
        return [];
      }

      const landingRole = pickLandingRole(
        activeRoles.flatMap((metadata) => {
          if (!previousInactiveIds.has(metadata.id)) {
            return [];
          }
          const pickupPlan = ownedPickupPlan(metadata.role);
          return pickupPlan === null
            ? []
            : [
                {
                  ...metadata,
                  pickupPlan: pickupPlan.text,
                  pickupPlanSource: pickupPlan.source,
                  pickupPlanGuidance: pickupPlan.guidance
                }
              ];
        })
      );
      if (!landingRole) {
        return [];
      }
      return [
        {
          section: section as RehearsalSection,
          sectionId,
          sectionLabel: sectionLabel as RehearsalSection["label"],
          sectionIndex,
          landingRole: landingRole.role,
          landingRoleId: landingRole.id,
          landingRoleName: landingRole.name,
          pickupPlan: landingRole.pickupPlan,
          pickupPlanSource: landingRole.pickupPlanSource,
          pickupPlanGuidance: landingRole.pickupPlanGuidance,
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

/** Return the first named pickup plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstPickupPlan(song: RehearsalSong): FirstPickupPlan | null {
  try {
    return resolveSafeFirstPickupPlan(song);
  } catch {
    return null;
  }
}
