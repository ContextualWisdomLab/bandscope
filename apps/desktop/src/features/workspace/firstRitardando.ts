import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_RITARDANDO_PLAN_CHARACTERS = 180;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);
const NAMED_RITARDANDO_ROLE_IDS = new Set(["bass-guitar", "lead-vocal"]);
const RITARDANDO_PLAN_PREFIX = "Ease this part from ";
const RITARDANDO_PLAN_MIDDLE = " BPM into ";
const RITARDANDO_PLAN_SUFFIX = " BPM; let the next downbeat land later.";
const HALF_TIME_RATIO_MIN = 0.45;
const HALF_TIME_RATIO_MAX = 0.55;

type RitardandoPlanSource = "model" | "user";

/** Structured localization guidance for model-generated ritardando-plan copy. */
export type RitardandoPlanGuidance = Readonly<{
  kind: "tempo";
  fromBpm: string;
  toBpm: string;
}>;

type RankedRoleMetadata = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
  isVocal: boolean;
}>;

type OwnedRitardandoPlan = Readonly<{
  text: string;
  source: RitardandoPlanSource | null;
  guidance: RitardandoPlanGuidance | null;
}>;

/** Tonight's first ritardando plan: the earliest corroborated slowing on a named vocal or bass. */
export type FirstRitardandoPlan = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  sectionIndex: number;
  landingRole: RehearsalRole;
  landingRoleId: string;
  landingRoleName: string;
  ritardandoPlan: string;
  ritardandoPlanSource: RitardandoPlanSource | null;
  ritardandoPlanGuidance: RitardandoPlanGuidance | null;
  atSeconds: number;
};

/** Format a non-negative ritardando-plan time as m:ss for rehearsal copy. */
export function formatRitardandoPlanTime(totalSeconds: number): string {
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
  const keys = Object.keys(value);
  if (keys.length !== length) {
    return null;
  }
  const items: unknown[] = [];
  for (const [index, key] of keys.entries()) {
    if (key !== String(index) || !hasOwnData(value, key)) {
      return null;
    }
    items.push(ownDataValue(value, key));
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

/** Preserve the engine ritardando template while enforcing the engine's slowing semantics. */
function boundedGeneratedRitardandoPlan(value: string): OwnedRitardandoPlan | null {
  if (
    !value.startsWith(RITARDANDO_PLAN_PREFIX) ||
    !value.endsWith(RITARDANDO_PLAN_SUFFIX) ||
    !value.includes(RITARDANDO_PLAN_MIDDLE)
  ) {
    return null;
  }
  const inner = value.slice(RITARDANDO_PLAN_PREFIX.length, -RITARDANDO_PLAN_SUFFIX.length);
  const middleIndex = inner.indexOf(RITARDANDO_PLAN_MIDDLE);
  if (middleIndex <= 0) {
    return null;
  }
  const fromBpm = inner.slice(0, middleIndex);
  const toBpm = inner.slice(middleIndex + RITARDANDO_PLAN_MIDDLE.length);
  if (!/^\d+(?:\.\d+)?$/u.test(fromBpm) || !/^\d+(?:\.\d+)?$/u.test(toBpm)) {
    return null;
  }
  const fromBpmValue = Number(fromBpm);
  const toBpmValue = Number(toBpm);
  if (
    !Number.isFinite(fromBpmValue) ||
    !Number.isFinite(toBpmValue) ||
    fromBpmValue <= 0 ||
    toBpmValue <= 0 ||
    toBpmValue >= fromBpmValue
  ) {
    return null;
  }
  const ratio = toBpmValue / fromBpmValue;
  if (ratio >= HALF_TIME_RATIO_MIN && ratio <= HALF_TIME_RATIO_MAX) {
    return null;
  }
  return {
    text: `${RITARDANDO_PLAN_PREFIX}${fromBpm}${RITARDANDO_PLAN_MIDDLE}${toBpm}${RITARDANDO_PLAN_SUFFIX}`,
    source: "model",
    guidance: { kind: "tempo", fromBpm, toBpm }
  };
}

/** Return a bounded snapshotted own ritardando plan and its explicit provenance, or null when malformed. */
function ownedRitardandoPlan(role: unknown): OwnedRitardandoPlan | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const ritardandoPlan = ownDataValue(role, "ritardandoPlan");
  const ritardandoPlanSource = ownDataValue(role, "ritardandoPlanSource");
  if (typeof ritardandoPlan !== "string") {
    return null;
  }
  if (
    ritardandoPlanSource !== undefined &&
    ritardandoPlanSource !== "model" &&
    ritardandoPlanSource !== "user"
  ) {
    return null;
  }
  if (ritardandoPlanSource === undefined) {
    return null;
  }
  const trimmed = ritardandoPlan.trim();
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
    return null;
  }
  if (ritardandoPlanSource === "model") {
    return boundedGeneratedRitardandoPlan(trimmed);
  }
  return {
    text: truncateCodePoints(trimmed, MAX_RITARDANDO_PLAN_CHARACTERS),
    source: ritardandoPlanSource,
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
  const roleType = ownDataValue(role, "roleType");
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
  if (!NAMED_RITARDANDO_ROLE_IDS.has(id) && roleType !== "vocal") {
    return null;
  }
  return {
    role: role as RehearsalRole,
    id,
    name,
    rehearsalPriority: rehearsalPriority as keyof typeof PRIORITY_RANK,
    isVocal: roleType === "vocal" || id === "lead-vocal"
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

/** Rank vocal roles before instrumental roles. */
function vocalRank(role: RankedRoleMetadata): number {
  return role.isVocal ? 0 : 1;
}

/** Prefer rehearsal priority, then a named vocal, then a locale-independent stable id. */
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
      const vocalDelta = vocalRank(left) - vocalRank(right);
      if (vocalDelta !== 0) {
        return vocalDelta;
      }
      return compareStableId(left.id, right.id);
    })[0] ?? null
  );
}

/** Return unique graph role ids whose node is explicitly active. */
function rankedActiveRoleIds(section: RehearsalSection): Set<string> {
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
}

/** Resolve a ritardando plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstRitardandoPlan(song: RehearsalSong): FirstRitardandoPlan | null {
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

      const activeIds = rankedActiveRoleIds(section as RehearsalSection);
      const roles = ownedDenseRuntimeArray(ownDataValue(section, "roles"));
      if (!roles) {
        return [];
      }
      const safeRoleIds = roles.flatMap((role) => {
        if (!isRuntimeObject(role)) {
          return [];
        }
        const id = ownDataValue(role, "id");
        return typeof id === "string" && id.trim().length > 0 ? [id] : [];
      });
      const repeatedRoleIds = repeatedIds(safeRoleIds);
      const landingRole = pickLandingRole(
        roles.flatMap((role) => {
          const metadata = ownedRankedRoleMetadata(role);
          if (
            metadata === null ||
            repeatedRoleIds.has(metadata.id) ||
            !activeIds.has(metadata.id)
          ) {
            return [];
          }
          const ritardandoPlan = ownedRitardandoPlan(metadata.role);
          return ritardandoPlan === null
            ? []
            : [
                {
                  ...metadata,
                  ritardandoPlan: ritardandoPlan.text,
                  ritardandoPlanSource: ritardandoPlan.source,
                  ritardandoPlanGuidance: ritardandoPlan.guidance
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
          ritardandoPlan: landingRole.ritardandoPlan,
          ritardandoPlanSource: landingRole.ritardandoPlanSource,
          ritardandoPlanGuidance: landingRole.ritardandoPlanGuidance,
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

/** Return the first named ritardando plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstRitardandoPlan(song: RehearsalSong): FirstRitardandoPlan | null {
  try {
    return resolveSafeFirstRitardandoPlan(song);
  } catch {
    return null;
  }
}
