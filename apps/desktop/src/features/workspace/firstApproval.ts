import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type CollaborationApprovalStatus,
  type RehearsalApproval,
  type RehearsalSection,
  type RehearsalSong,
  type SectionFormLabel
} from "@bandscope/shared-types";

const ACTIONABLE_STATUS_RANK = { changes_requested: 0, pending: 1 } as const;
const MAX_APPROVAL_SCOPE_CHARACTERS = 180;
const FORM_LABELS_BY_LENGTH = [...SECTION_FORM_LABELS].sort((left, right) => right.length - left.length);

/** Tonight's first named approval: the earliest owned sign-off and the unique section it names. */
export type FirstApproval = {
  section: RehearsalSection | null;
  approval: RehearsalApproval;
  atSeconds: number | null;
  scope: string;
};

/** Format a non-negative approval time as m:ss for rehearsal copy. */
export function formatApprovalTime(totalSeconds: number): string {
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

/** Return a bounded owned approval scope, or null when the field cannot be shown. */
function ownedApprovalScope(approval: RehearsalApproval): string | null {
  if (!hasOwnData(approval, "scope") || typeof approval.scope !== "string") {
    return null;
  }
  const scope = approval.scope.trim();
  if (scope.length === 0) {
    return null;
  }
  return truncateCodePoints(scope, MAX_APPROVAL_SCOPE_CHARACTERS);
}

/** Return true when the approval owns identity, owner, status, and a named scope. */
function isActionableApproval(approval: RehearsalApproval): boolean {
  return (
    isRuntimeObject(approval) &&
    hasOwnData(approval, "id") &&
    typeof approval.id === "string" &&
    approval.id.trim().length > 0 &&
    hasOwnData(approval, "owner") &&
    typeof approval.owner === "string" &&
    approval.owner.trim().length > 0 &&
    hasOwnData(approval, "status") &&
    Object.prototype.hasOwnProperty.call(ACTIONABLE_STATUS_RANK, approval.status) &&
    ownedApprovalScope(approval) !== null
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

/** Map unique owned ids onto their records; duplicated ids are not authority. */
function uniqueOwnedById<T extends object>(
  items: T[],
  readId: (item: T) => string | null
): Map<string, T> {
  const unique = new Map<string, T>();
  const repeated = new Set<string>();
  for (const item of items) {
    if (!isRuntimeObject(item)) {
      continue;
    }
    const id = readId(item);
    if (id === null || repeated.has(id)) {
      continue;
    }
    if (unique.has(id)) {
      unique.delete(id);
      repeated.add(id);
      continue;
    }
    unique.set(id, item);
  }
  return unique;
}

/** Collect canonical form labels that appear as whole tokens in an owned scope. */
function matchedFormLabels(scope: string): Set<SectionFormLabel> {
  const normalized = scope.toLowerCase();
  const occupied = Array.from({ length: normalized.length }, () => false);
  const matched = new Set<SectionFormLabel>();

  for (const label of FORM_LABELS_BY_LENGTH) {
    let from = 0;
    while (from <= normalized.length - label.length) {
      const index = normalized.indexOf(label, from);
      if (index === -1) {
        break;
      }
      const beforeOk = index === 0 || /[^a-z]/.test(normalized[index - 1] ?? "");
      const afterIndex = index + label.length;
      const afterOk = afterIndex === normalized.length || /[^a-z]/.test(normalized[afterIndex] ?? "");
      let alreadyOccupied = false;
      for (let cursor = index; cursor < afterIndex; cursor += 1) {
        if (occupied[cursor]) {
          alreadyOccupied = true;
          break;
        }
      }
      if (beforeOk && afterOk && !alreadyOccupied) {
        matched.add(label);
        for (let cursor = index; cursor < afterIndex; cursor += 1) {
          occupied[cursor] = true;
        }
      }
      from = index + 1;
    }
  }

  return matched;
}

/** Return owned sections that can host an approval. */
function uniqueReadySections(song: RehearsalSong): Map<string, RehearsalSection> {
  if (!isRuntimeObject(song) || !hasOwnData(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return new Map();
  }

  return uniqueOwnedById(
    song.sections.filter(
      (section) =>
        isRuntimeObject(section) &&
        hasOwnData(section, "label") &&
        typeof section.label === "string" &&
        section.label.trim().length > 0 &&
        hasOwnData(section, "id") &&
        typeof section.id === "string" &&
        section.id.trim().length > 0 &&
        hasBoundedTimeRange(section)
    ),
    (section) => (hasOwnData(section, "id") && typeof section.id === "string" ? section.id : null)
  );
}

/** Return the unique ready section named by the owned scope, or null when the pointer is ambiguous. */
function resolveNamedSection(scope: string, sections: Map<string, RehearsalSection>): RehearsalSection | null {
  const labels = matchedFormLabels(scope);
  if (labels.size === 0) {
    return null;
  }
  const named = [...sections.values()].filter(
    (section) => hasOwnData(section, "label") && labels.has(section.label)
  );
  return named.length === 1 ? (named[0] ?? null) : null;
}

/** Resolve an approval after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstApproval(song: RehearsalSong): FirstApproval | null {
  if (
    !isRuntimeObject(song) ||
    !hasOwnData(song, "collaboration") ||
    !isRuntimeObject(song.collaboration) ||
    !hasOwnData(song.collaboration, "approvals") ||
    !isDenseRuntimeArray(song.collaboration.approvals)
  ) {
    return null;
  }

  const sections = uniqueReadySections(song);
  const uniqueApprovals = uniqueOwnedById(
    song.collaboration.approvals.filter((approval) => isActionableApproval(approval)),
    (approval) => (hasOwnData(approval, "id") && typeof approval.id === "string" ? approval.id : null)
  );

  const candidates = [...uniqueApprovals.values()]
    .flatMap((approval) => {
      const scope = ownedApprovalScope(approval);
      if (scope === null) {
        return [];
      }
      const section = resolveNamedSection(scope, sections);
      return [
        {
          section,
          approval,
          atSeconds: section ? section.timeRange.start : null,
          scope
        }
      ];
    })
    .sort((left, right) => {
      const statusDelta =
        ACTIONABLE_STATUS_RANK[left.approval.status as Exclude<CollaborationApprovalStatus, "approved">] -
        ACTIONABLE_STATUS_RANK[right.approval.status as Exclude<CollaborationApprovalStatus, "approved">];
      if (statusDelta !== 0) {
        return statusDelta;
      }
      const leftTime = left.atSeconds ?? Number.POSITIVE_INFINITY;
      const rightTime = right.atSeconds ?? Number.POSITIVE_INFINITY;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return compareStableId(left.approval.id, right.approval.id);
    });

  return candidates[0] ?? null;
}

/** Return the first named approval, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstApproval(song: RehearsalSong): FirstApproval | null {
  try {
    return resolveSafeFirstApproval(song);
  } catch {
    return null;
  }
}
