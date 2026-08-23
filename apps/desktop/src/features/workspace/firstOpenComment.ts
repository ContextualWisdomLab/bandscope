import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalComment,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_OPEN_COMMENT_CHARACTERS = 180;
const MAX_OPEN_COMMENT_AUTHOR_CHARACTERS = 80;

/** Tonight's first open rehearsal comment: the earliest owned note and the part it names. */
export type FirstOpenComment = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  comment: RehearsalComment;
  atSeconds: number;
  author: string;
  hint: string;
};

/** Format a non-negative comment time as m:ss for rehearsal copy. */
export function formatOpenCommentTime(totalSeconds: number): string {
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

/** Return true when the role has safe owned identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    hasOwnData(role, "id") &&
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    hasOwnData(role, "name") &&
    typeof role.name === "string" &&
    role.name.trim().length > 0 &&
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
  if (
    !isRuntimeObject(timeRange) ||
    !hasOwnData(timeRange, "start") ||
    !hasOwnData(timeRange, "end")
  ) {
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

/** Return a bounded owned open-comment body, or null when the field cannot be shown. */
function ownedOpenCommentHint(comment: RehearsalComment): string | null {
  if (
    !hasOwnData(comment, "status") ||
    comment.status !== "open" ||
    !hasOwnData(comment, "body") ||
    typeof comment.body !== "string"
  ) {
    return null;
  }
  const hint = comment.body.trim();
  if (hint.length === 0) {
    return null;
  }
  return truncateCodePoints(hint, MAX_OPEN_COMMENT_CHARACTERS);
}

/** Return a bounded owned author name, or null when the field cannot be shown. */
function ownedOpenCommentAuthor(comment: RehearsalComment): string | null {
  if (!hasOwnData(comment, "author") || typeof comment.author !== "string") {
    return null;
  }
  const author = comment.author.trim();
  if (author.length === 0) {
    return null;
  }
  return truncateCodePoints(author, MAX_OPEN_COMMENT_AUTHOR_CHARACTERS);
}

/** Return whether a comment owns the identity fields required to stay on tonight's map. */
function hasOwnedCommentIdentity(comment: RehearsalComment): boolean {
  return (
    hasOwnData(comment, "id") &&
    typeof comment.id === "string" &&
    comment.id.trim().length > 0 &&
    hasOwnData(comment, "sectionId") &&
    typeof comment.sectionId === "string" &&
    comment.sectionId.trim().length > 0
  );
}

/** Return the matching owned section for a comment, or null when the map target is unsafe. */
function sectionForComment(song: RehearsalSong, sectionId: string): RehearsalSection | null {
  if (!hasOwnData(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return null;
  }
  const matches = song.sections.filter(
    (section) =>
      isRuntimeObject(section) &&
      hasOwnData(section, "id") &&
      typeof section.id === "string" &&
      section.id === sectionId &&
      hasOwnData(section, "label") &&
      typeof section.label === "string" &&
      section.label.trim().length > 0 &&
      hasBoundedTimeRange(section)
  );
  if (matches.length !== 1) {
    return null;
  }
  return matches[0] ?? null;
}

/** Return the corroborated holding part, or null when the comment stays section-wide. */
function holdingRoleForComment(section: RehearsalSection, comment: RehearsalComment): RehearsalRole | null {
  if (!hasOwnData(comment, "roleId") || typeof comment.roleId !== "string" || comment.roleId.trim().length === 0) {
    return null;
  }
  const matches = rankedActiveRoles(section).filter((role) => role.id === comment.roleId);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Resolve an open comment after the runtime root has passed its structural boundary checks. */
function resolveSafeFirstOpenComment(song: RehearsalSong): FirstOpenComment | null {
  if (
    !isRuntimeObject(song) ||
    !hasOwnData(song, "collaboration") ||
    !isRuntimeObject(song.collaboration) ||
    !hasOwnData(song.collaboration, "comments") ||
    !isDenseRuntimeArray(song.collaboration.comments)
  ) {
    return null;
  }

  const candidates: FirstOpenComment[] = [];
  for (const comment of song.collaboration.comments) {
    if (!isRuntimeObject(comment) || !hasOwnedCommentIdentity(comment)) {
      continue;
    }
    const hint = ownedOpenCommentHint(comment);
    const author = ownedOpenCommentAuthor(comment);
    if (hint === null || author === null) {
      continue;
    }
    const section = sectionForComment(song, comment.sectionId);
    if (!section) {
      continue;
    }
    candidates.push({
      section,
      holdingRole: holdingRoleForComment(section, comment),
      comment,
      atSeconds: section.timeRange.start,
      author,
      hint
    });
  }

  candidates.sort((left, right) => {
    if (left.atSeconds !== right.atSeconds) {
      return left.atSeconds - right.atSeconds;
    }
    return compareStableId(left.comment.id, right.comment.id);
  });

  return candidates[0] ?? null;
}

/** Return the first open rehearsal comment, or null when untrusted runtime metadata cannot be read safely. */
export function resolveFirstOpenComment(song: RehearsalSong): FirstOpenComment | null {
  try {
    return resolveSafeFirstOpenComment(song);
  } catch {
    return null;
  }
}
