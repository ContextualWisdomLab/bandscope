import type { RehearsalRole, RehearsalSection, RehearsalSong } from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first pickup: the incoming part that catches a handoff or a labeled pickup section. */
export type FirstPickupHandoff = {
  section: RehearsalSection;
  fromRole: RehearsalRole | null;
  toRole: RehearsalRole;
  atSeconds: number;
};

/** Format a non-negative pickup time as m:ss for rehearsal copy. */
export function formatPickupTime(totalSeconds: number): string {
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

/** Return true when the role has a safe runtime identity and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Require an active outgoing graph node to authorize a handoff source. */
function hasActiveOutgoingHandoff(
  section: RehearsalSection,
  fromRoleId: string,
  toRoleId: string
): boolean {
  return section.partGraph.some(
    (candidate) =>
      candidate.role_id === fromRoleId &&
      candidate.is_active === true &&
      Array.isArray(candidate.handoff_to) &&
      candidate.handoff_to.includes(toRoleId)
  );
}

/** Require the receiving graph node to corroborate the outgoing edge. */
function hasReciprocalHandoff(section: RehearsalSection, fromRoleId: string, toRoleId: string): boolean {
  return section.partGraph.some(
    (candidate) =>
      candidate.role_id === toRoleId &&
      Array.isArray(candidate.handoff_from) &&
      candidate.handoff_from.includes(fromRoleId)
  );
}

/** Return ranked roles in a section, optionally requiring an active graph node. */
function rankedRolesInSection(section: RehearsalSection, requireActive: boolean): RehearsalRole[] {
  const rolesInSection = new Map(section.roles.map((role) => [role.id, role]));
  const activeIds = new Set(
    section.partGraph.filter((node) => node.is_active === true).map((node) => node.role_id)
  );

  return section.roles.filter((role) => {
    if (!hasRankedPriority(role) || rolesInSection.get(role.id) !== role) {
      return false;
    }
    return !requireActive || activeIds.has(role.id);
  });
}

/** Prefer the highest-priority ranked role, then a stable id order. */
function pickHighestPriorityRole(roles: RehearsalRole[]): RehearsalRole | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const rankDelta = PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return left.id.localeCompare(right.id);
    })[0] ?? null
  );
}

/** Resolve an incoming corroborating partner for a pickup role, if one exists. */
function resolveIncomingPartner(section: RehearsalSection, toRole: RehearsalRole): RehearsalRole | null {
  const rolesInSection = new Map(section.roles.map((role) => [role.id, role]));
  const incomingIds = section.partGraph
    .filter((node) => node.role_id === toRole.id && Array.isArray(node.handoff_from))
    .flatMap((node) => node.handoff_from);

  const partners = incomingIds
    .filter((roleId): roleId is string => typeof roleId === "string" && roleId.trim().length > 0)
    .map((roleId) => rolesInSection.get(roleId) ?? null)
    .filter(
      (role): role is RehearsalRole =>
        role !== null &&
        hasRankedPriority(role) &&
        role.id !== toRole.id &&
        hasActiveOutgoingHandoff(section, role.id, toRole.id) &&
        hasReciprocalHandoff(section, role.id, toRole.id)
    );

  return pickHighestPriorityRole(partners);
}

/** Return whether a section has a bounded, non-negative rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  if (!isRuntimeObject(section.timeRange)) {
    return false;
  }
  return (
    Number.isFinite(section.timeRange.start) &&
    section.timeRange.start >= 0 &&
    Number.isFinite(section.timeRange.end) &&
    section.timeRange.end >= section.timeRange.start
  );
}

/** Prefer an explicit pickup form label before falling back to an incoming handoff. */
function resolveLabeledPickupSection(song: RehearsalSong): FirstPickupHandoff | null {
  const pickupSections = song.sections
    .filter(
      (section) =>
        isRuntimeObject(section) && section.label === "pickup" && hasBoundedTimeRange(section)
    )
    .sort((left, right) => left.timeRange.start - right.timeRange.start);

  for (const section of pickupSections) {
    const toRole = pickHighestPriorityRole(rankedRolesInSection(section, true));
    if (!toRole) {
      continue;
    }
    return {
      section,
      fromRole: resolveIncomingPartner(section, toRole),
      toRole,
      atSeconds: section.timeRange.start
    };
  }

  return null;
}

/** Return the first validated incoming pickup, or null when no safe candidate remains. */
export function resolveFirstPickupHandoff(song: RehearsalSong): FirstPickupHandoff | null {
  if (!isRuntimeObject(song) || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const labeled = resolveLabeledPickupSection(song);
  if (labeled) {
    return labeled;
  }

  const sections = song.sections
    .filter((section) => isRuntimeObject(section) && hasBoundedTimeRange(section))
    .sort((left, right) => {
      if (left.timeRange.end !== right.timeRange.end) {
        return left.timeRange.end - right.timeRange.end;
      }
      return left.timeRange.start - right.timeRange.start;
    });

  const candidates: FirstPickupHandoff[] = [];

  for (const section of sections) {
    const rolesInSection = new Map(section.roles.map((role) => [role.id, role]));

    for (const node of section.partGraph) {
      if (
        node.is_active !== true ||
        !Array.isArray(node.handoff_to) ||
        node.handoff_to.length === 0
      ) {
        continue;
      }

      const fromRole = rolesInSection.get(node.role_id);
      if (!fromRole || !hasRankedPriority(fromRole)) {
        continue;
      }

      const targets = node.handoff_to
        .filter((roleId): roleId is string => typeof roleId === "string" && roleId.trim().length > 0)
        .map((roleId) => rolesInSection.get(roleId) ?? null)
        .filter(
          (role): role is RehearsalRole =>
            role !== null &&
            hasRankedPriority(role) &&
            role.id !== fromRole.id &&
            hasReciprocalHandoff(section, fromRole.id, role.id)
        );

      const toRole = pickHighestPriorityRole(targets);
      if (!toRole) {
        continue;
      }

      candidates.push({
        section,
        fromRole,
        toRole,
        atSeconds: section.timeRange.end
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (left.atSeconds !== right.atSeconds) {
      return left.atSeconds - right.atSeconds;
    }
    return PRIORITY_RANK[left.toRole.rehearsalPriority] - PRIORITY_RANK[right.toRole.rehearsalPriority];
  });

  return candidates[0] ?? null;
}
