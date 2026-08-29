import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  isNonEmptySingleLineText,
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

type GraphNodeSnapshot = Readonly<{
  roleId: string;
  isActive: boolean;
}>;

type SectionSnapshot = Readonly<{
  section: RehearsalSection;
  sectionIndex: number;
  id: string;
  label: RehearsalSection["label"];
  start: number;
  end: number;
  roles: unknown[];
  partGraph: unknown[];
}>;

/** Tonight's first voicing plan: the earliest labeled section and the part that owns it. */
export type FirstVoicingPlan = {
  section: RehearsalSection;
  sectionIndex: number;
  sectionId: string;
  sectionLabel: RehearsalSection["label"];
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

/** Snapshot a bounded dense array through own descriptors without later index reads. */
function snapshotDenseRuntimeArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const lengthDescriptor = ownDataDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
    return null;
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownDataDescriptor(value, index);
    if (descriptor === null) {
      return null;
    }
    items.push(descriptor.value);
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

/** Return a bounded snapshotted own voicing plan, or null when it cannot be shown. */
function ownedVoicingPlan(role: unknown): string | null {
  if (!isRuntimeObject(role)) {
    return null;
  }
  const descriptor = ownDataDescriptor(role, "voicingPlan");
  if (descriptor === null || typeof descriptor.value !== "string") {
    return null;
  }
  if (!isNonEmptySingleLineText(descriptor.value)) {
    return null;
  }
  const trimmed = descriptor.value.trim();
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

/** Snapshot one graph node's role identity and activity flag through own descriptors. */
function snapshotGraphNode(node: unknown): GraphNodeSnapshot | null {
  if (!isRuntimeObject(node)) {
    return null;
  }
  const roleId = ownedNonBlankString(node, "role_id");
  const isActive = ownDataDescriptor(node, "is_active")?.value;
  return roleId !== null && typeof isActive === "boolean" ? { roleId, isActive } : null;
}

/** Snapshot one section's buyer/navigation authority without later untrusted property reads. */
function snapshotSection(section: unknown, sectionIndex: number): SectionSnapshot | null {
  if (!isRuntimeObject(section)) {
    return null;
  }
  const id = ownedNonBlankString(section, "id");
  const label = ownDataDescriptor(section, "label")?.value;
  const timeRange = ownDataDescriptor(section, "timeRange")?.value;
  const roles = snapshotDenseRuntimeArray(ownDataDescriptor(section, "roles")?.value);
  const partGraph = snapshotDenseRuntimeArray(ownDataDescriptor(section, "partGraph")?.value);
  if (
    id === null ||
    typeof label !== "string" ||
    !SECTION_FORM_LABEL_SET.has(label) ||
    !isRuntimeObject(timeRange) ||
    roles === null ||
    partGraph === null
  ) {
    return null;
  }
  const start = ownDataDescriptor(timeRange, "start")?.value;
  const end = ownDataDescriptor(timeRange, "end")?.value;
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
  return {
    section: section as RehearsalSection,
    sectionIndex,
    id,
    label: label as RehearsalSection["label"],
    start,
    end,
    roles,
    partGraph
  };
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
function rankedActiveRoles(section: SectionSnapshot): RankedRoleSnapshot[] {
  const roleSnapshots = section.roles.flatMap((role) => {
    const snapshot = snapshotRankedRole(role);
    return snapshot === null ? [] : [snapshot];
  });
  const graphSnapshots = section.partGraph.flatMap((node) => {
    const snapshot = snapshotGraphNode(node);
    return snapshot === null ? [] : [snapshot];
  });
  const repeatedRoleIds = repeatedIds(roleSnapshots.map((role) => role.id));
  const repeatedGraphRoleIds = repeatedIds(graphSnapshots.map((node) => node.roleId));
  const activeIds = new Set(
    graphSnapshots.flatMap((node) =>
      node.isActive && !repeatedGraphRoleIds.has(node.roleId) ? [node.roleId] : []
    )
  );

  return roleSnapshots.filter(
    (role) => !repeatedRoleIds.has(role.id) && activeIds.has(role.id)
  );
}

/** Resolve a voicing plan after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstVoicingPlan(song: RehearsalSong): FirstVoicingPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }
  const sections = snapshotDenseRuntimeArray(ownDataDescriptor(song, "sections")?.value);
  if (sections === null) {
    return null;
  }

  const candidates = sections
    .flatMap((section, sectionIndex) => {
      const sectionSnapshot = snapshotSection(section, sectionIndex);
      if (sectionSnapshot === null) {
        return [];
      }
      const voicingRoles = rankedActiveRoles(sectionSnapshot).flatMap((role) => {
        const candidate = snapshotVoicingRole(role);
        return candidate === null ? [] : [candidate];
      });
      const holdingRole = pickHoldingRole(voicingRoles);
      if (!holdingRole) {
        return [];
      }
      return [
        {
          section: sectionSnapshot.section,
          sectionIndex: sectionSnapshot.sectionIndex,
          sectionId: sectionSnapshot.id,
          sectionLabel: sectionSnapshot.label,
          holdingRole: holdingRole.role,
          holdingRoleId: holdingRole.id,
          holdingRoleName: holdingRole.name,
          voicingPlan: holdingRole.voicingPlan,
          atSeconds: sectionSnapshot.start
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

/** Return the first named voicing plan, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstVoicingPlan(song: RehearsalSong): FirstVoicingPlan | null {
  try {
    return resolveSafeFirstVoicingPlan(song);
  } catch {
    return null;
  }
}
