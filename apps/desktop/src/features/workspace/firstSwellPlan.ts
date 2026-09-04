import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  isNonEmptySingleLineText,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_SWELL_PLAN_CHARACTERS = 180;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);
const ACCOMPANIMENT_SOURCE_ROLE_IDS = new Set([
  "keys-left",
  "keys-right",
  "acoustic-guitar"
]);
const ACCOMPANIMENT_SOURCE_ID = "other";
const SWELL_PLAN_SOLO = "Swell this part; grow into the next downbeat.";
const SWELL_PLAN_PREFIX = "Swell this part with ";
const SWELL_PLAN_SUFFIX = "; grow into the next downbeat.";

type SwellPlanSource = "model" | "user";

/** Structured localization guidance for model-generated swell-plan copy. */
export type SwellPlanGuidance =
  | Readonly<{ kind: "solo" }>
  | Readonly<{ kind: "role"; targetRoleName: string }>;

type RankedRoleMetadata = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
}>;

type OwnedSwellPlan = Readonly<{
  text: string;
  source: SwellPlanSource;
  guidance: SwellPlanGuidance | null;
}>;

/** Tonight's first swell plan: the earliest labeled intensity rise on staying sources. */
export type FirstSwellPlan = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  sectionIndex: number;
  landingRole: RehearsalRole;
  landingRoleId: string;
  landingRoleName: string;
  swellPlan: string;
  swellPlanSource: SwellPlanSource;
  swellPlanGuidance: SwellPlanGuidance | null;
  atSeconds: number;
};

/** Format a non-negative swell-plan time as m:ss for rehearsal copy. */
export function formatSwellPlanTime(totalSeconds: number): string {
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

/** Preserve the engine swell template while bounding its model-owned target and localization guidance. */
function boundedGeneratedSwellPlan(value: string): OwnedSwellPlan | null {
  if (value === SWELL_PLAN_SOLO) {
    return { text: SWELL_PLAN_SOLO, source: "model", guidance: { kind: "solo" } };
  }
  if (!value.startsWith(SWELL_PLAN_PREFIX) || !value.endsWith(SWELL_PLAN_SUFFIX)) {
    return null;
  }
  const target = value.slice(SWELL_PLAN_PREFIX.length, -SWELL_PLAN_SUFFIX.length);
  if (target.trim().length === 0) {
    return null;
  }
  const fixedLength = Array.from(SWELL_PLAN_PREFIX + SWELL_PLAN_SUFFIX).length;
  const boundedTarget = truncateCodePoints(target, MAX_SWELL_PLAN_CHARACTERS - fixedLength);
  return {
    text: `${SWELL_PLAN_PREFIX}${boundedTarget}${SWELL_PLAN_SUFFIX}`,
    source: "model",
    guidance: { kind: "role", targetRoleName: boundedTarget }
  };
}

/** Return a bounded snapshotted own swell plan and its explicit provenance, or null when malformed. */
function ownedSwellPlan(role: unknown): OwnedSwellPlan | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const swellPlan = ownDataValue(role, "swellPlan");
  const swellPlanSource = ownDataValue(role, "swellPlanSource");
  if (typeof swellPlan !== "string") {
    return null;
  }
  if (swellPlanSource !== "model" && swellPlanSource !== "user") {
    return null;
  }
  if (!isNonEmptySingleLineText(swellPlan)) {
    return null;
  }
  if (swellPlanSource === "model") {
    const trimmed = swellPlan.trim();
    return boundedGeneratedSwellPlan(trimmed);
  }
  return {
    text: swellPlan,
    source: swellPlanSource,
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
function swellSourceId(roleId: string): string {
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

/** Return unique graph role ids whose node is explicitly active or inactive. */
function rankedGraphRoleIds(section: RehearsalSection, isActive: boolean): Set<string> {
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
      if (!isRuntimeObject(node) || ownDataValue(node, "is_active") !== isActive) {
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

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RankedRoleMetadata[] {
  const roles = ownedDenseRuntimeArray(ownDataValue(section, "roles"));
  if (!roles) {
    return [];
  }
  const activeIds = rankedGraphRoleIds(section, true);
  const safeRoleIds = roles.flatMap((role) => {
    if (!isRuntimeObject(role)) {
      return [];
    }
    const id = ownDataValue(role, "id");
    return typeof id === "string" && id.trim().length > 0 ? [id] : [];
  });
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  return roles.flatMap((role) => {
    const metadata = ownedRankedRoleMetadata(role);
    return metadata !== null && !repeatedRoleIds.has(metadata.id) && activeIds.has(metadata.id)
      ? [metadata]
      : [];
  });
}

/** Return distinct source-separation stems that are explicitly active. */
function activeSourceIds(activeIds: Set<string>): Set<string> {
  return new Set([...activeIds].map((roleId) => swellSourceId(roleId)));
}

/** Resolve a swell plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstSwellPlan(song: RehearsalSong): FirstSwellPlan | null {
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

      const previousActiveIds = rankedGraphRoleIds(previousSection as RehearsalSection, true);
      const currentActiveIds = rankedGraphRoleIds(section as RehearsalSection, true);
      const previousSourceIds = activeSourceIds(previousActiveIds);
      const currentSourceIds = activeSourceIds(currentActiveIds);
      if (previousSourceIds.size < 1 || currentSourceIds.size !== previousSourceIds.size) {
        return [];
      }
      for (const sourceId of previousSourceIds) {
        if (!currentSourceIds.has(sourceId)) {
          return [];
        }
      }

      const landingRole = pickLandingRole(
        rankedActiveRoles(section as RehearsalSection).flatMap((metadata) => {
          if (
            !previousActiveIds.has(metadata.id) ||
            ACCOMPANIMENT_SOURCE_ROLE_IDS.has(metadata.id)
          ) {
            return [];
          }
          const swellPlan = ownedSwellPlan(metadata.role);
          return swellPlan === null
            ? []
            : [
                {
                  ...metadata,
                  swellPlan: swellPlan.text,
                  swellPlanSource: swellPlan.source,
                  swellPlanGuidance: swellPlan.guidance
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
          swellPlan: landingRole.swellPlan,
          swellPlanSource: landingRole.swellPlanSource,
          swellPlanGuidance: landingRole.swellPlanGuidance,
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

/** Return the first named swell plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstSwellPlan(song: RehearsalSong): FirstSwellPlan | null {
  try {
    return resolveSafeFirstSwellPlan(song);
  } catch {
    return null;
  }
}
