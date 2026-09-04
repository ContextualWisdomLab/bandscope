import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong,
  type SectionFormLabel
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

type PartGraphNode = RehearsalSection["partGraph"][number];

/** Tonight's first dropout: earliest section handoff, then the highest-priority outgoing part. */
export type FirstDropoutHandoff = {
  section: RehearsalSection;
  fromRole: RehearsalRole;
  toRole: RehearsalRole;
  endSeconds: number;
};

/** Format a non-negative dropout time as m:ss for rehearsal copy. */
export function formatDropoutTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Return whether an untrusted runtime value can be inspected as an object. */
function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

/** Return whether every numeric index is present in a bounded runtime array. */
function isDenseRuntimeArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const length = Number(value.length);
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!(index in value)) {
      return false;
    }
  }
  return true;
}

/** Return true when every section-local identity is unambiguous. */
function hasUniqueIdentities(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

/** Return whether one role has safe buyer-visible identity and copy. */
function hasSafeRoleIdentity(role: unknown): role is RehearsalRole {
  if (!isRuntimeObject(role)) {
    return false;
  }
  const candidate = role as Partial<RehearsalRole>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0
  );
}

/** Return true when the safe role also has a ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority);
}

/** Return the usable role ids in a complete edge array, or null for sparse evidence. */
function safeRoleIds(value: unknown): string[] | null {
  if (!isDenseRuntimeArray(value)) {
    return null;
  }
  return value.filter(
    (roleId): roleId is string => typeof roleId === "string" && roleId.trim().length > 0
  );
}

/** Return whether one graph node has safe section-local identity and complete edge arrays. */
function isSafeGraphNode(value: unknown): value is PartGraphNode {
  if (!isRuntimeObject(value)) {
    return false;
  }
  const candidate = value as Partial<PartGraphNode>;
  return (
    typeof candidate.role_id === "string" &&
    candidate.role_id.trim().length > 0 &&
    isDenseRuntimeArray(candidate.handoff_to) &&
    isDenseRuntimeArray(candidate.handoff_from)
  );
}

/** Return whether one section has safe identity, form, and a bounded positive integer window. */
function hasBoundedSectionWindow(value: unknown): value is RehearsalSection {
  if (!isRuntimeObject(value)) {
    return false;
  }
  const section = value as Partial<RehearsalSection>;
  const timeRange = section.timeRange as Partial<RehearsalSection["timeRange"]> | null;
  if (timeRange === null || typeof timeRange !== "object") {
    return false;
  }
  const start = timeRange.start ?? -1;
  const end = timeRange.end ?? -1;
  return (
    typeof section.id === "string" &&
    section.id.trim().length > 0 &&
    typeof section.label === "string" &&
    SECTION_FORM_LABELS.includes(section.label as SectionFormLabel) &&
    Number.isInteger(start) &&
    start >= 0 &&
    start <= MAX_SECTION_TIME_SECONDS &&
    Number.isInteger(end) &&
    end > start &&
    end <= MAX_SECTION_TIME_SECONDS
  );
}

/** Return the non-empty string identity carried by an untrusted object, when present. */
function runtimeIdentity(value: unknown, key: "id" | "role_id"): string | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  const identity = (value as Record<string, unknown>)[key];
  return typeof identity === "string" && identity.trim().length > 0 ? identity : null;
}

/** Require the receiving graph node to corroborate the outgoing edge. */
function hasReciprocalHandoff(
  graphNodes: readonly PartGraphNode[],
  fromRoleId: string,
  toRoleId: string
): boolean {
  return graphNodes.some((candidate) => {
    const incomingRoleIds = safeRoleIds(candidate.handoff_from);
    return (
      candidate.role_id === toRoleId &&
      incomingRoleIds !== null &&
      incomingRoleIds.includes(fromRoleId)
    );
  });
}

/** Return the first validated section-local dropout, or null when no safe candidate remains. */
export function resolveFirstDropoutHandoff(song: RehearsalSong): FirstDropoutHandoff | null {
  if (!isRuntimeObject(song) || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const sections = song.sections
    .filter(hasBoundedSectionWindow)
    .sort((left, right) => left.timeRange.start - right.timeRange.start);

  const candidates: FirstDropoutHandoff[] = [];

  for (const section of sections) {
    if (!isDenseRuntimeArray(section.roles) || !isDenseRuntimeArray(section.partGraph)) {
      continue;
    }

    const roleIdentities = section.roles
      .map((role) => runtimeIdentity(role, "id"))
      .filter((identity): identity is string => identity !== null);
    const graphIdentities = section.partGraph
      .map((node) => runtimeIdentity(node, "role_id"))
      .filter((identity): identity is string => identity !== null);
    if (!hasUniqueIdentities(roleIdentities) || !hasUniqueIdentities(graphIdentities)) {
      continue;
    }

    const safeRoles = section.roles.filter(hasSafeRoleIdentity);
    const safeGraphNodes = section.partGraph.filter(isSafeGraphNode);
    const rolesInSection = new Map(safeRoles.map((role) => [role.id, role]));

    for (const node of safeGraphNodes) {
      const handoffTargets = safeRoleIds(node.handoff_to);
      if (node.is_active !== true || handoffTargets === null || handoffTargets.length === 0) {
        continue;
      }

      const fromRole = rolesInSection.get(node.role_id);
      if (!fromRole || !hasRankedPriority(fromRole)) {
        continue;
      }

      const targets = handoffTargets
        .map((roleId) => rolesInSection.get(roleId) ?? null)
        .filter(
          (role): role is RehearsalRole =>
            role !== null &&
            hasRankedPriority(role) &&
            role.id !== fromRole.id &&
            hasReciprocalHandoff(safeGraphNodes, fromRole.id, role.id)
        );

      if (targets.length === 0) {
        continue;
      }

      const toRole = [...targets].sort(
        (left, right) => PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority]
      )[0];
      if (!toRole) {
        continue;
      }

      candidates.push({
        section,
        fromRole,
        toRole,
        endSeconds: section.timeRange.end
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (left.endSeconds !== right.endSeconds) {
      return left.endSeconds - right.endSeconds;
    }
    return PRIORITY_RANK[left.fromRole.rehearsalPriority] - PRIORITY_RANK[right.fromRole.rehearsalPriority];
  });

  return candidates[0] ?? null;
}