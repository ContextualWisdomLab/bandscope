import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_FERMATA_PLAN_CHARACTERS = 180;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);
const NAMED_FERMATA_ROLE_IDS = new Set(["bass-guitar", "lead-vocal"]);
const FERMATA_PLAN_PREFIX = "Hold this part through the extra ";
const FERMATA_PLAN_SUFFIX = " s; wait for the cutoff before the next entrance.";
const MIN_FERMATA_HOLD_SECONDS = 0.25;
const MAX_FERMATA_HOLD_SECONDS = 8;

type FermataPlanSource = "model" | "user";

/** Structured localization guidance for model-generated fermata-plan copy. */
export type FermataPlanGuidance = Readonly<{
  kind: "hold";
  holdSeconds: string;
}>;

type RankedRoleMetadata = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: keyof typeof PRIORITY_RANK;
  isVocal: boolean;
}>;

type OwnedFermataPlan = Readonly<{
  text: string;
  source: FermataPlanSource;
  guidance: FermataPlanGuidance | null;
  atSeconds: number | null;
}>;

/** Tonight's first fermata plan: the earliest isolated beat-gap hold on a named vocal or bass. */
export type FirstFermataPlan = {
  section: RehearsalSection;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
  sectionIndex: number;
  landingRole: RehearsalRole;
  landingRoleId: string;
  landingRoleName: string;
  fermataPlan: string;
  fermataPlanSource: FermataPlanSource;
  fermataPlanGuidance: FermataPlanGuidance | null;
  atSeconds: number;
};

/** Format a non-negative fermata-plan time as m:ss for rehearsal copy. */
export function formatFermataPlanTime(totalSeconds: number): string {
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

/** Preserve the engine fermata template while enforcing isolated extra-hold semantics. */
function boundedGeneratedFermataPlan(
  value: string,
  atSeconds: number
): OwnedFermataPlan | null {
  if (!value.startsWith(FERMATA_PLAN_PREFIX) || !value.endsWith(FERMATA_PLAN_SUFFIX)) {
    return null;
  }
  const holdSeconds = value.slice(FERMATA_PLAN_PREFIX.length, -FERMATA_PLAN_SUFFIX.length);
  if (!/^\d+(?:\.\d+)?$/u.test(holdSeconds) || holdSeconds.includes("BPM")) {
    return null;
  }
  const holdValue = Number(holdSeconds);
  if (
    !Number.isFinite(holdValue) ||
    holdValue < MIN_FERMATA_HOLD_SECONDS ||
    holdValue > MAX_FERMATA_HOLD_SECONDS
  ) {
    return null;
  }
  return {
    text: `${FERMATA_PLAN_PREFIX}${holdSeconds}${FERMATA_PLAN_SUFFIX}`,
    source: "model",
    guidance: { kind: "hold", holdSeconds },
    atSeconds
  };
}

/** Return a bounded snapshotted own fermata plan and its explicit provenance, or null when malformed. */
function ownedFermataPlan(role: unknown): OwnedFermataPlan | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const fermataPlan = ownDataValue(role, "fermataPlan");
  const fermataPlanSource = ownDataValue(role, "fermataPlanSource");
  const fermataPlanAtSeconds = ownDataValue(role, "fermataPlanAtSeconds");
  if (typeof fermataPlan !== "string") {
    return null;
  }
  if (
    fermataPlanSource !== "model" &&
    fermataPlanSource !== "user"
  ) {
    return null;
  }
  if (
    fermataPlanAtSeconds !== undefined &&
    (typeof fermataPlanAtSeconds !== "number" ||
      !Number.isFinite(fermataPlanAtSeconds) ||
      fermataPlanAtSeconds < 0)
  ) {
    return null;
  }
  const atSeconds = fermataPlanAtSeconds === undefined ? null : fermataPlanAtSeconds;
  const trimmed = fermataPlan.trim();
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
    return null;
  }
  if (fermataPlanSource === "model") {
    return atSeconds === null ? null : boundedGeneratedFermataPlan(trimmed, atSeconds);
  }
  return {
    text: truncateCodePoints(trimmed, MAX_FERMATA_PLAN_CHARACTERS),
    source: fermataPlanSource,
    guidance: null,
    atSeconds
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
  if (!NAMED_FERMATA_ROLE_IDS.has(id) && roleType !== "vocal") {
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

/** Resolve an fermata plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstFermataPlan(song: RehearsalSong): FirstFermataPlan | null {
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
          const fermataPlan = ownedFermataPlan(metadata.role);
          return fermataPlan === null
            ? []
            : [
                {
                  ...metadata,
                  fermataPlan: fermataPlan.text,
                  fermataPlanSource: fermataPlan.source,
                  fermataPlanGuidance: fermataPlan.guidance,
                  atSeconds: fermataPlan.atSeconds
                }
              ];
        })
      );
      if (!landingRole) {
        return [];
      }
      const atSeconds = landingRole.atSeconds ?? timeRange.start;
      if (atSeconds < timeRange.start || atSeconds >= timeRange.end) {
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
          fermataPlan: landingRole.fermataPlan,
          fermataPlanSource: landingRole.fermataPlanSource,
          fermataPlanGuidance: landingRole.fermataPlanGuidance,
          atSeconds
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

/** Return the first named fermata plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstFermataPlan(song: RehearsalSong): FirstFermataPlan | null {
  try {
    return resolveSafeFirstFermataPlan(song);
  } catch {
    return null;
  }
}
