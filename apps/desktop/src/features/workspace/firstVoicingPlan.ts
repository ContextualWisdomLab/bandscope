import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_VOICING_PLAN_CHARACTERS = 180;
const SECTION_FORM_LABEL_SET = new Set<string>(SECTION_FORM_LABELS);

type RehearsalPriority = keyof typeof PRIORITY_RANK;

type RankedRoleSnapshot = Readonly<{
  role: RehearsalRole;
  id: string;
  name: string;
  rehearsalPriority: RehearsalPriority;
}>;

type VoicingRoleSnapshot = RankedRoleSnapshot &
  Readonly<{
    voicingPlan: string;
  }>;

/** Tonight's first voicing plan: the earliest labeled section and the part that owns it. */
export type FirstVoicingPlan = {
  section: RehearsalSection;
  holdingRole: RehearsalRole;
  holdingRoleId: string;
  holdingRoleName: string;
  voicingPlan: string;
  atSeconds: number;
};

/** Format a non-negative voicing-plan time as m:ss for rehearsal copy. */
export function formatVoicingPlanTime(totalSeconds: number): string {
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

/** Return an own data-property descriptor, rejecting inherited or accessor state. */
function ownDataDescriptor(value: object, key: PropertyKey): PropertyDescriptor | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor
    : null;
}

/** Return whether a runtime record owns a stable data property rather than inherited/accessor state. */
function hasOwnData(value: object, key: PropertyKey): boolean {
  return ownDataDescriptor(value, key) !== null;
}

/** Snapshot one non-blank owned string without consulting a Proxy get trap. */
function ownedNonBlankString(value: unknown, key: PropertyKey): string | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  const descriptor = ownDataDescriptor(value, key);
  if (descriptor === null || typeof descriptor.value !== "string") {
    return null;
  }
  return descriptor.value.trim().length > 0 ? descriptor.value : null;
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

/** Return a bounded snapshotted own voicing plan, or null when it cannot be shown. */
function ownedVoicingPlan(role: unknown): string | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const descriptor = ownDataDescriptor(role, "voicingPlan");
  if (descriptor === null || typeof descriptor.value !== "string") {
    return null;
  }
  const trimmed = descriptor.value.trim();
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
    return null;
  }
  return truncateCodePoints(trimmed, MAX_VOICING_PLAN_CHARACTERS);
}

/** Snapshot owned role identity and priority without later untrusted property reads. */
function snapshotRankedRole(role: unknown): RankedRoleSnapshot | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const id = ownedNonBlankString(role, "id");
  const name = ownedNonBlankString(role, "name");
  const priorityDescriptor = ownDataDescriptor(role, "rehearsalPriority");
  const rehearsalPriority = priorityDescriptor?.value;
  if (
    id === null ||
    name === null ||
    typeof rehearsalPriority !== "string" ||
    !Object.prototype.hasOwnProperty.call(PRIORITY_RANK, rehearsalPriority)
  ) {
    return null;
  }
  return {
    role: role as RehearsalRole,
    id,
    name,
    rehearsalPriority: rehearsalPriority as RehearsalPriority
  };
}

/** Attach one snapshotted owned voicing plan to an already validated role snapshot. */
function snapshotVoicingRole(role: RankedRoleSnapshot): VoicingRoleSnapshot | null {
  const voicingPlan = ownedVoicingPlan(role.role);
  return voicingPlan === null ? null : { ...role, voicingPlan };
}

/** Return whether a section owns a canonical form label from the shared contract. */
function hasSupportedSectionLabel(section: RehearsalSection): boolean {
  return (
    hasOwnData(section, "label") &&
    typeof section.label === "string" &&
    SECTION_FORM_LABEL_SET.has(section.label)
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

/** Prefer rehearsal priority, then a locale-independent stable role id. */
function pickHoldingRole(roles: VoicingRoleSnapshot[]): VoicingRoleSnapshot | null {
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

/** Return snapshotted ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RankedRoleSnapshot[] {
  if (
    !hasOwnData(section, "roles") ||
    !hasOwnData(section, "partGraph") ||
    !isDenseRuntimeArray(section.roles) ||
    !isDenseRuntimeArray(section.partGraph)
  ) {
    return [];
  }

  const safeRoleIds = section.roles.flatMap((role) => {
    const id = ownedNonBlankString(role, "id");
    return id === null ? [] : [id];
  });
  const safeGraphRoleIds = section.partGraph.flatMap((node) => {
    const roleId = ownedNonBlankString(node, "role_id");
    return roleId === null ? [] : [roleId];
  });
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    section.partGraph.flatMap((node) => {
      if (!isRuntimeObject(node)) {
        return [];
      }
      const roleId = ownedNonBlankString(node, "role_id");
      const isActive = ownDataDescriptor(node, "is_active")?.value;
      return roleId !== null && isActive === true && !repeatedGraphRoleIds.has(roleId)
        ? [roleId]
        : [];
    })
  );

  return section.roles.flatMap((role) => {
    const snapshot = snapshotRankedRole(role);
    return snapshot !== null && !repeatedRoleIds.has(snapshot.id) && activeIds.has(snapshot.id)
      ? [snapshot]
      : [];
  });
}

/** Resolve a voicing plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstVoicingPlan(song: RehearsalSong): FirstVoicingPlan | null {
  if (!isRuntimeObject(song) || !hasOwnData(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const candidates = song.sections
    .filter(
      (section) =>
        isRuntimeObject(section) &&
        hasSupportedSectionLabel(section) &&
        hasOwnData(section, "id") &&
        typeof section.id === "string" &&
        section.id.trim().length > 0 &&
        hasBoundedTimeRange(section)
    )
    .flatMap((section) => {
      const voicingRoles = rankedActiveRoles(section).flatMap((role) => {
        const candidate = snapshotVoicingRole(role);
        return candidate === null ? [] : [candidate];
      });
      const holdingRole = pickHoldingRole(voicingRoles);
      if (!holdingRole) {
        return [];
      }
      return [
        {
          section,
          holdingRole: holdingRole.role,
          holdingRoleId: holdingRole.id,
          holdingRoleName: holdingRole.name,
          voicingPlan: holdingRole.voicingPlan,
          atSeconds: section.timeRange.start
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

/** Return the first named voicing plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstVoicingPlan(song: RehearsalSong): FirstVoicingPlan | null {
  try {
    return resolveSafeFirstVoicingPlan(song);
  } catch {
    return null;
  }
}
