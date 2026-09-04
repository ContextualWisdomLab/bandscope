import {
  MAX_SECTION_TIME_SECONDS,
  type PartGraphNode,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_ROLE_NAME_CHARACTERS = 80;

/** Tonight's first part handoff: the destination section and the parts that own the pass into it. */
export type FirstPartHandoff = {
  section: RehearsalSection;
  givingRole: RehearsalRole;
  receivingRole: RehearsalRole;
  givingName: string;
  receivingName: string;
  atSeconds: number;
};

/** Format a non-negative part-handoff time as m:ss for rehearsal copy. */
export function formatPartHandoffTime(totalSeconds: number): string {
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

/** Return a bounded own role name, or null when it cannot be shown. */
function ownedRoleName(role: unknown): string | null {
  if (!isRuntimeObject(role) || !hasOwnData(role, "name")) {
    return null;
  }
  const name = (role as { name?: unknown }).name;
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
    return null;
  }
  return truncateCodePoints(trimmed, MAX_ROLE_NAME_CHARACTERS);
}

/** Return true when the role has safe owned identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    hasOwnData(role, "id") &&
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    ownedRoleName(role) !== null &&
    hasOwnData(role, "rehearsalPriority") &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
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

/** Return whether a section has safe identity, label, and timing for buyer-visible navigation. */
function isSafeSection(section: RehearsalSection): boolean {
  return (
    isRuntimeObject(section) &&
    hasOwnData(section, "label") &&
    typeof section.label === "string" &&
    section.label.trim().length > 0 &&
    hasOwnData(section, "id") &&
    typeof section.id === "string" &&
    section.id.trim().length > 0 &&
    hasBoundedTimeRange(section)
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

/** Return owned unique non-blank string ids from a dense graph-edge collection. */
function ownedUniqueEdgeIds(value: unknown): string[] | null {
  if (!isDenseRuntimeArray(value)) {
    return null;
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\r")) {
      return null;
    }
    ids.push(trimmed);
  }
  if (repeatedIds(ids).size > 0) {
    return null;
  }
  return ids;
}

/** Prefer the earlier ranked role, then rehearsal priority, then a locale-independent id. */
function pickRankedRole(roles: RehearsalRole[]): RehearsalRole | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareStableId(left.id, right.id);
    })[0] ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RehearsalRole[] {
  if (
    !hasOwnData(section, "roles") ||
    !hasOwnData(section, "partGraph") ||
    !isDenseRuntimeArray(section.roles) ||
    !isDenseRuntimeArray(section.partGraph)
  ) {
    return [];
  }

  const safeRoleIds = section.roles
    .filter(
      (role) =>
        isRuntimeObject(role) &&
        hasOwnData(role, "id") &&
        typeof role.id === "string" &&
        role.id.trim().length > 0
    )
    .map((role) => role.id);
  const safeGraphRoleIds = section.partGraph
    .filter(
      (node) =>
        isRuntimeObject(node) &&
        hasOwnData(node, "role_id") &&
        typeof node.role_id === "string" &&
        node.role_id.trim().length > 0
    )
    .map((node) => node.role_id);
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    section.partGraph
      .filter(
        (node) =>
          isRuntimeObject(node) &&
          hasOwnData(node, "is_active") &&
          node.is_active === true &&
          hasOwnData(node, "role_id") &&
          typeof node.role_id === "string" &&
          node.role_id.trim().length > 0 &&
          !repeatedGraphRoleIds.has(node.role_id)
      )
      .map((node) => node.role_id)
  );

  return section.roles.filter(
    (role) =>
      isRuntimeObject(role) &&
      hasRankedPriority(role) &&
      !repeatedRoleIds.has(role.id) &&
      activeIds.has(role.id)
  );
}

/** Return the unique owned graph node for a role, or null when identity is untrusted. */
function ownedGraphNode(section: RehearsalSection, roleId: string): PartGraphNode | null {
  if (!hasOwnData(section, "partGraph") || !isDenseRuntimeArray(section.partGraph)) {
    return null;
  }
  const matches = section.partGraph.filter(
    (node) =>
      isRuntimeObject(node) &&
      hasOwnData(node, "role_id") &&
      typeof node.role_id === "string" &&
      node.role_id === roleId
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Return whether a source receiver edge is corroborated and becomes active in the destination. */
function isCorroboratedReceiver(
  source: RehearsalSection,
  destination: RehearsalSection,
  givingRoleId: string,
  receivingRoleId: string
): boolean {
  const sourceReceiverNode = ownedGraphNode(source, receivingRoleId);
  const destinationReceiverNode = ownedGraphNode(destination, receivingRoleId);
  const destinationGivingNode = ownedGraphNode(destination, givingRoleId);
  if (
    sourceReceiverNode === null ||
    destinationReceiverNode === null ||
    destinationGivingNode === null ||
    !hasOwnData(sourceReceiverNode, "handoff_from") ||
    !hasOwnData(sourceReceiverNode, "is_active") ||
    sourceReceiverNode.is_active !== false ||
    !hasOwnData(destinationReceiverNode, "is_active") ||
    destinationReceiverNode.is_active !== true ||
    !hasOwnData(destinationGivingNode, "is_active") ||
    destinationGivingNode.is_active !== false
  ) {
    return false;
  }
  const incoming = ownedUniqueEdgeIds(sourceReceiverNode.handoff_from);
  return incoming !== null && incoming.includes(givingRoleId);
}

/** Resolve a corroborated source-to-destination pass after the runtime root passes structural checks. */
function resolveSafeFirstPartHandoff(
  song: RehearsalSong,
  activeRole: string | null
): FirstPartHandoff | null {
  if (!isRuntimeObject(song) || !hasOwnData(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const candidates: FirstPartHandoff[] = [];
  for (let sectionIndex = 0; sectionIndex < song.sections.length - 1; sectionIndex += 1) {
    const source = song.sections[sectionIndex];
    const destination = song.sections[sectionIndex + 1];
    if (!source || !destination || !isSafeSection(source) || !isSafeSection(destination)) {
      continue;
    }

    const sourceActiveRoles = rankedActiveRoles(source);
    const destinationActiveRoles = rankedActiveRoles(destination);
    const destinationById = new Map(destinationActiveRoles.map((role) => [role.id, role]));
    const passes = sourceActiveRoles.flatMap((givingRole) => {
      const givingNode = ownedGraphNode(source, givingRole.id);
      if (
        givingNode === null ||
        !hasOwnData(givingNode, "handoff_to") ||
        !hasOwnData(givingNode, "is_active") ||
        givingNode.is_active !== true
      ) {
        return [];
      }
      const outgoing = ownedUniqueEdgeIds(givingNode.handoff_to);
      if (outgoing === null) {
        return [];
      }
      const receivingRoles = outgoing
        .filter((roleId) => roleId !== givingRole.id)
        .map((roleId) => destinationById.get(roleId))
        .filter((role): role is RehearsalRole => role !== undefined)
        .filter((receivingRole) =>
          isCorroboratedReceiver(source, destination, givingRole.id, receivingRole.id)
        )
        .filter(
          (receivingRole) =>
            activeRole === null ||
            givingRole.id === activeRole ||
            receivingRole.id === activeRole
        );
      const receivingRole = pickRankedRole(receivingRoles);
      return receivingRole ? [{ givingRole, receivingRole }] : [];
    });
    const chosen = pickRankedRole(passes.map((pass) => pass.givingRole));
    const matched = chosen ? passes.find((pass) => pass.givingRole.id === chosen.id) : undefined;
    if (!matched) {
      continue;
    }
    const givingName = ownedRoleName(matched.givingRole);
    const receivingName = ownedRoleName(matched.receivingRole);
    if (!givingName || !receivingName) {
      continue;
    }
    candidates.push({
      section: destination,
      givingRole: matched.givingRole,
      receivingRole: matched.receivingRole,
      givingName,
      receivingName,
      atSeconds: destination.timeRange.start
    });
  }

  candidates.sort((left, right) => {
    if (left.atSeconds !== right.atSeconds) {
      return left.atSeconds - right.atSeconds;
    }
    return compareStableId(left.section.id, right.section.id);
  });
  return candidates[0] ?? null;
}

/** Return the first named part handoff, optionally scoped to a selected giving or receiving role. */
export function resolveFirstPartHandoff(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstPartHandoff | null {
  try {
    return resolveSafeFirstPartHandoff(song, activeRole);
  } catch {
    return null;
  }
}
